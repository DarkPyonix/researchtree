import { childrenOf, parentOf, t, type ResearchTree, type Season, type TreeNode, type VersionNode } from "@researchtree/core";
import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { BRANCH_COLORS } from "../theme";

/** The root as a version node, so it can open the version panel (it is the first research version). */
export function rootVersion(tree: ResearchTree): VersionNode {
  return { id: tree.root, name: tree.rootVersion ?? "", sha: "", date: "", parent: "", mergedFrom: [], grownFrom: [], children: tree.rootChildren, depth: 0 };
}

/** Color of the research trunk (root and version milestones). */
export const TRUNK_COLOR = "#1f3b46";

export interface Datum {
  id: string;
  node?: TreeNode;
  version?: VersionNode;
  children?: Datum[];
}

/** Hierarchy input shared by the 2D and 3D views: root → experiments and version milestones. */
export function hierarchyData(tree: ResearchTree): Datum {
  const toDatum = (id: string): Datum => ({
    id,
    node: tree.nodes.get(id),
    version: tree.versions.get(id),
    children: childrenOf(tree, id).map(toDatum),
  });
  return { id: tree.root, children: tree.rootChildren.map(toDatum) };
}

/**
 * Branch colors. Every experiment that sprouts directly from the trunk (the root or a version)
 * starts a new color; its descendants inherit it. The trunk itself uses TRUNK_COLOR.
 */
export function branchColors(tree: ResearchTree, palette: readonly string[] = BRANCH_COLORS): Map<string, string> {
  const colors = new Map<string, string>([[tree.root, TRUNK_COLOR]]);
  let next = 0;
  const walk = (id: string, inherited: string | null) => {
    for (const c of childrenOf(tree, id)) {
      if (tree.versions.has(c)) {
        colors.set(c, TRUNK_COLOR);
        walk(c, null);
        continue;
      }
      const color = inherited ?? palette[next++ % palette.length]!;
      colors.set(c, color);
      walk(c, color);
    }
  };
  walk(tree.root, null);
  return colors;
}

/**
 * Extra (dashed) edges: adopted experiments merged into a version other than the one it grows from,
 * and the research trunk itself (previous version → next version), since research history is linear.
 */
export function mergeLinks(tree: ResearchTree): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let prev = tree.root;
  for (const v of tree.versions.values()) {
    if (v.parent !== prev) out.push({ from: prev, to: v.id });
    // Every other end of the merged chains joins the new version too.
    for (const from of v.grownFrom) if (from !== v.parent) out.push({ from, to: v.id });
    prev = v.id;
  }
  return out;
}

/** Island (research version) a node lives on: its nearest version ancestor, or the root. */
export function islandOf(tree: ResearchTree, id: string): string {
  for (let cur: string | undefined = id; cur; cur = parentOf(tree, cur)) if (cur === tree.root || tree.versions.has(cur)) return cur;
  return tree.root;
}

/** Every island: the root (first version) and each later version. */
export function islandIds(tree: ResearchTree): string[] {
  return [tree.root, ...tree.versions.keys()];
}

/** Metric keys recorded by experiments on an island, most used first. */
export function islandMetricKeys(tree: ResearchTree, island: string): string[] {
  const counts = new Map<string, number>();
  for (const n of tree.nodes.values()) {
    if (islandOf(tree, n.id) !== island) continue;
    for (const k of Object.keys(n.meta.metrics ?? {})) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

/** IDs from the selected node up to the root (inclusive of the node). */
export function pathSet(tree: ResearchTree, id: string | null): Set<string> {
  const set = new Set<string>();
  for (let cur: string | undefined = id ?? undefined; cur && !set.has(cur); cur = parentOf(tree, cur)) set.add(cur);
  return set;
}

// ------------------------------------------------------------------ time axis

const DAY = 86_400_000;

export interface Placed {
  /** Horizontal position in 2D pixels (time axis) */
  x: number;
  /** Sibling row from the tidy tree layout (multiply by the row spacing) */
  row: number;
  depth: number;
  data: Datum;
}

export interface Placement {
  pos: Map<string, Placed>;
  links: { source: Placed; target: Placed }[];
  /** Whether x follows real dates (false when every node has the same time) */
  timed: boolean;
  start: number;
  end: number;
  dateToX(ms: number): number;
  xToDate(x: number): number;
}

/** Time of a node on the axis: experiment start, version tag date; the root sits just before everything. */
function timeOf(tree: ResearchTree, id: string): number | undefined {
  const n = tree.nodes.get(id);
  if (n) return Date.parse(n.startedAt);
  const v = tree.versions.get(id);
  return v ? Date.parse(v.date) : undefined;
}

/**
 * Place the tree on a real time axis. Rows come from d3's tidy tree; x follows each node's date,
 * except that a child is pushed right of its parent for room (a wide channel before a new
 * version's island). The date <-> x mapping bends through the placed nodes so year and season
 * marks match where nodes actually are.
 */
export function placeTree(tree: ResearchTree, col: number): Placement {
  const layout = d3tree<Datum>()
    .nodeSize([1, 1])
    // Every fork is one row apart, whoever the neighbours are (islands are kept apart along x instead),
    // so branching distances look the same everywhere.
    .separation(() => 1)(hierarchy<Datum>(hierarchyData(tree)));
  const pts = layout.descendants();

  const times = pts.map((p) => (p.depth === 0 ? undefined : timeOf(tree, p.data.id))).filter((t): t is number => t !== undefined && !Number.isNaN(t));
  const t0 = times.length ? Math.min(...times) - 3 * DAY : Date.now();
  const t1 = times.length ? Math.max(...times) : t0;
  const timed = t1 - t0 > 4 * DAY;
  const time = (p: (typeof pts)[number]) => (p.depth === 0 ? t0 : timeOf(tree, p.data.id) ?? t0);

  // Scale: a typical parent→child gap spans a bit more than the minimum gap below, so date-spaced and
  // pushed nodes end up equally far apart. Only the total width bounds it (no fixed px/day cap).
  const gaps = layout.links().map((l) => Math.max(0.5, (time(l.target) - time(l.source)) / DAY)).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] ?? 7;
  const spanDays = Math.max(1, (t1 - t0) / DAY);
  const maxWidth = Math.max(24, pts.length) * col;
  const pxPerDay = Math.min(Math.max((col * 1.2) / median, 2), maxWidth / spanDays);

  // Every parent -> child step has the same length (a wider one where a new version's island starts),
  // whatever the dates: equal spacing reads better than a literal time scale. Dates still drive the
  // year and season marks through the date <-> x fit below.
  const pos = new Map<string, Placed>();
  const place = (p: (typeof pts)[number], parent: Placed | null) => {
    const newIsland = parent !== null && islandOf(tree, parent.data.id) !== islandOf(tree, p.data.id);
    const x = parent === null ? 0 : parent.x + (newIsland ? col * 1.8 : col * 1.3);
    const placed = { x, row: p.x, depth: p.depth, data: p.data };
    pos.set(p.data.id, placed);
    for (const c of p.children ?? []) place(c, placed);
  };
  place(layout, null);
  const links = layout.links().map((l) => ({ source: pos.get(l.source.data.id)!, target: pos.get(l.target.data.id)! }));

  // Date <-> x follows where nodes actually sit (they get pushed right for room), as a monotone
  // piecewise-linear fit through (time, x): pool-adjacent-violators averages out-of-order pushes.
  const blocks: { t: number; x: number; n: number }[] = [];
  for (const p of [...pts].sort((a, b) => time(a) - time(b))) {
    blocks.push({ t: time(p), x: pos.get(p.data.id)!.x, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.x / a.n <= b.x / b.n && a.t / a.n < b.t / b.n) break;
      blocks.pop();
      a.t += b.t;
      a.x += b.x;
      a.n += b.n;
    }
  }
  const samples = blocks.map((b) => ({ t: b.t / b.n, x: b.x / b.n }));
  const interp = (v: number, from: "t" | "x", to: "t" | "x", slope: number): number => {
    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    if (v <= first[from]) return first[to] - (first[from] - v) * slope;
    if (v >= last[from]) return last[to] + (v - last[from]) * slope;
    let i = 1;
    while (samples[i]![from] < v) i++;
    const a = samples[i - 1]!;
    const b = samples[i]!;
    return a[to] + ((v - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  };
  const dateToX = (ms: number): number => (timed ? interp(ms, "t", "x", pxPerDay / DAY) : 0);
  const xToDate = (x: number): number => (timed ? interp(x, "x", "t", DAY / pxPerDay) : t0);
  return { pos, links, timed, start: t0, end: t1, dateToX, xToDate };
}

/** January 1st of every year touching the range. */
export function yearBoundaries(start: number, end: number): { at: number; year: number }[] {
  const out: { at: number; year: number }[] = [];
  for (let y = new Date(start).getFullYear(); y <= new Date(end).getFullYear() + 1; y++) out.push({ at: new Date(y, 0, 1).getTime(), year: y });
  return out;
}

export function seasonLabel(season: Season): string {
  return t(`season.${season}`);
}

export function formatVersionDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}
