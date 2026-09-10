import { shortName, type ResearchTree, type Status, type TreeNode } from "@researchtree/core";
import { hierarchy, tree as d3tree, type HierarchyPointLink, type HierarchyPointNode } from "d3-hierarchy";
import { select, type Selection } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
import { BRANCH_COLORS, formatMetric, reducedMotion, STATUS_LABEL } from "../theme";

interface Datum {
  id: string;
  node?: TreeNode;
  children?: Datum[];
}

type Point = HierarchyPointNode<Datum>;

export interface ViewFilter {
  hidden: ReadonlySet<Status>;
  metric: string | null;
}

export interface TreeViewOptions {
  onSelect(id: string | null): void;
  /** Areas covering the canvas, such as the side panel and bottom bar (px) */
  insets(): { top: number; right: number; bottom: number; left: number };
}

const ROW = 64;
const COL = 310;
const LABEL_X = 14;
const MAX_LABEL = 24;
const GROW_STEP = 240;

export class TreeView {
  private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly g: Selection<SVGGElement, unknown, null, undefined>;
  private readonly zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
  private points = new Map<string, Point>();
  private colors = new Map<string, string>();
  private tree: ResearchTree | null = null;
  private selected: string | null = null;
  private grown = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: TreeViewOptions,
  ) {
    this.svg = select(container).append("svg").attr("class", "tree-canvas").attr("role", "tree");
    this.g = this.svg.append("g");
    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 2.5])
      .on("zoom", (e) => this.g.attr("transform", e.transform.toString()));
    this.svg.call(this.zoomBehavior).on("dblclick.zoom", null);
    this.svg.on("click", (e: MouseEvent) => {
      if (e.target === this.svg.node()) this.opts.onSelect(null);
    });
  }

  render(tree: ResearchTree, filter: ViewFilter): void {
    const firstForTree = this.tree?.repo !== tree.repo;
    this.tree = tree;

    const toDatum = (id: string): Datum => {
      const node = tree.nodes.get(id)!;
      return { id, node, children: node.children.map(toDatum) };
    };
    const root = hierarchy<Datum>({ id: tree.root, children: tree.rootChildren.map(toDatum) });
    const layout = d3tree<Datum>()
      .nodeSize([ROW, COL])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.3))(root);

    this.points = new Map(layout.descendants().map((p) => [p.data.id, p]));
    this.colors = new Map();
    tree.rootChildren.forEach((id, i) => {
      const color = BRANCH_COLORS[i % BRANCH_COLORS.length]!;
      const paint = (nid: string) => {
        this.colors.set(nid, color);
        tree.nodes.get(nid)?.children.forEach(paint);
      };
      paint(id);
    });

    this.g.selectAll("*").remove();
    // Links are drawn after nodes are measured, but must sit underneath them.
    const linksG = this.g.append("g").attr("class", "links");
    const nodesG = this.g.append("g").attr("class", "nodes");

    const isDim = (d: Datum) => Boolean(d.node && filter.hidden.has(d.node.status));

    const nodes = nodesG
      .selectAll<SVGGElement, Point>("g")
      .data(layout.descendants())
      .join("g")
      .attr("class", (p) => {
        const n = p.data.node;
        if (!n) return "node root";
        return `node status-${n.status}${isDim(p.data) ? " dim" : ""}${n.pr.draft ? " draft" : ""}`;
      })
      .attr("data-id", (p) => p.data.id)
      .attr("transform", (p) => `translate(${p.y},${p.x})`)
      .attr("tabindex", (p) => (p.data.node ? 0 : null))
      .attr("role", (p) => (p.data.node ? "treeitem" : null))
      .attr("aria-label", (p) => (p.data.node ? `${p.data.id} ${STATUS_LABEL[p.data.node.status]}` : null))
      .style("--c", (p) => this.colors.get(p.data.id) ?? "#1d2a30")
      .on("click", (e: MouseEvent, p) => {
        e.stopPropagation();
        this.opts.onSelect(p.data.node ? p.data.id : null);
      })
      .on("keydown", (e: KeyboardEvent, p) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.opts.onSelect(p.data.id);
        }
      });

    nodes.append("title").text((p) => (p.data.node ? `${p.data.id}\n${p.data.node.pr.title}` : `${tree.root} (루트)`));
    nodes.append("circle").attr("class", "halo").attr("r", 17);
    nodes.append("circle").attr("class", "dot").attr("r", (p) => (p.data.node ? 7 : 9));

    const labels = nodes.filter((p) => Boolean(p.data.node));
    labels
      .append("text")
      .attr("class", "name")
      .attr("x", LABEL_X)
      .attr("y", -2)
      .text((p) => {
        const s = shortName(p.data.id);
        return s.length > MAX_LABEL ? `${s.slice(0, MAX_LABEL - 1)}…` : s;
      });
    labels
      .append("text")
      .attr("class", "sub")
      .attr("x", LABEL_X)
      .attr("y", 14)
      .text((p) => {
        const n = p.data.node!;
        const v = filter.metric ? n.meta.metrics?.[filter.metric] : undefined;
        const tag = n.pr.draft ? "초안" : STATUS_LABEL[n.status];
        return v !== undefined ? `${filter.metric} ${formatMetric(v)} · ${tag}` : tag;
      });

    const warned = labels.filter((p) => p.data.node!.warnings.length > 0);
    const badge = warned.append("g").attr("class", "warn").attr("transform", "translate(-9,-10)");
    badge.append("circle").attr("r", 6);
    badge.append("text").attr("text-anchor", "middle").attr("y", 3.5).text("!");

    nodes
      .filter((p) => !p.data.node)
      .append("text")
      .attr("class", "name root-name")
      .attr("x", -16)
      .attr("y", 4)
      .attr("text-anchor", "end")
      .text(tree.root);

    // Outgoing links start where the parent's label ends, so they never cross text.
    const labelEnd = new Map<string, number>();
    nodes.each(function (p) {
      if (!p.data.node) {
        labelEnd.set(p.data.id, 12);
        return;
      }
      let w = 0;
      select(this)
        .selectAll<SVGTextElement, unknown>("text")
        .each(function () {
          w = Math.max(w, this.getComputedTextLength());
        });
      labelEnd.set(p.data.id, LABEL_X + w + 10);
    });

    linksG
      .selectAll("path")
      .data(layout.links())
      .join("path")
      .attr("class", (l) => `link status-${l.target.data.node?.status ?? "root"}${isDim(l.target.data) ? " dim" : ""}`)
      .attr("data-target", (l) => l.target.data.id)
      .attr("d", (l) => {
        const tx = l.target.y - 11;
        const sx = Math.min(l.source.y + (labelEnd.get(l.source.data.id) ?? 12), tx - 36);
        const sy = l.source.x;
        const ty = l.target.x;
        const mx = sx + (tx - sx) * 0.55;
        return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
      })
      .attr("stroke", (l) => this.colors.get(l.target.data.id) ?? "#999");

    this.applySelection();

    if (firstForTree) {
      this.fit(undefined, false);
      if (!this.grown && !reducedMotion()) this.grow();
      this.grown = true;
    }
  }

  /** Intro animation: branches grow out from the root. */
  private grow(): void {
    this.g.selectAll<SVGPathElement, HierarchyPointLink<Datum>>("path.link").each(function (l) {
      const len = this.getTotalLength();
      select(this)
        .attr("stroke-dasharray", `${len} ${len}`)
        .attr("stroke-dashoffset", len)
        .transition()
        .delay((l.target.depth - 1) * GROW_STEP)
        .duration(520)
        .attr("stroke-dashoffset", 0)
        .on("end", function () {
          select(this).attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
        });
    });
    this.g
      .selectAll<SVGGElement, Point>("g.node")
      .style("opacity", 0)
      .transition()
      .delay((p) => (p.depth === 0 ? 0 : (p.depth - 1) * GROW_STEP + 380))
      .duration(320)
      .style("opacity", null);
  }

  select(id: string | null, focus = true): void {
    this.selected = id;
    this.applySelection();
    if (id && focus) this.centerOn(id);
  }

  private applySelection(): void {
    const sel = this.selected;
    const onPath = new Set<string>();
    if (sel && this.tree) {
      let cur = this.tree.nodes.get(sel);
      while (cur) {
        onPath.add(cur.id);
        cur = this.tree.nodes.get(cur.parent);
      }
    }
    this.g.selectAll<SVGGElement, Point>("g.node").classed("selected", (p) => p.data.id === sel).classed("on-path", (p) => onPath.has(p.data.id));
    this.g.selectAll<SVGPathElement, HierarchyPointLink<Datum>>("path.link").classed("on-path", (l) => onPath.has(l.target.data.id));
  }

  private viewport() {
    const i = this.opts.insets();
    const w = Math.max(200, this.container.clientWidth - i.left - i.right);
    const h = Math.max(200, this.container.clientHeight - i.top - i.bottom);
    return { ...i, w, h };
  }

  /** Smoothly move the camera to a node. */
  centerOn(id: string, scale?: number): void {
    const p = this.points.get(id);
    if (!p) return;
    const v = this.viewport();
    const k = scale ?? Math.max(zoomTransform(this.svg.node()!).k, 1);
    const t = zoomIdentity.translate(v.left + v.w / 2 - (p.y + 60) * k, v.top + v.h / 2 - p.x * k).scale(k);
    this.transition(t);
  }

  /** Fit the given nodes (or all nodes) into the viewport. */
  fit(ids?: readonly string[], animate = true, maxScale = 1.15): void {
    const pts = ids ? ids.map((id) => this.points.get(id)).filter((p): p is Point => Boolean(p)) : [...this.points.values()];
    if (pts.length === 0) return;
    const x0 = Math.min(...pts.map((p) => p.y)) - 110;
    const x1 = Math.max(...pts.map((p) => p.y)) + 210;
    const y0 = Math.min(...pts.map((p) => p.x)) - 40;
    const y1 = Math.max(...pts.map((p) => p.x)) + 40;
    const v = this.viewport();
    const k = Math.min(maxScale, v.w / (x1 - x0), v.h / (y1 - y0));
    const t = zoomIdentity
      .translate(v.left + (v.w - (x1 - x0) * k) / 2 - x0 * k, v.top + (v.h - (y1 - y0) * k) / 2 - y0 * k)
      .scale(k);
    if (animate) this.transition(t);
    else this.svg.call(this.zoomBehavior.transform, t);
  }

  zoomBy(factor: number): void {
    this.svg.transition().duration(250).call(this.zoomBehavior.scaleBy, factor);
  }

  private transition(t: ReturnType<typeof zoomIdentity.scale>): void {
    if (reducedMotion()) this.svg.call(this.zoomBehavior.transform, t);
    else this.svg.transition().duration(750).call(this.zoomBehavior.transform, t);
  }

  focusNode(id: string): void {
    (this.g.select(`g.node[data-id="${CSS.escape(id)}"]`).node() as SVGGElement | null)?.focus({ preventScroll: true });
  }
}
