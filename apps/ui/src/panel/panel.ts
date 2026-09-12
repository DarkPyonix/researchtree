import { diffSpecs, parentMetrics, pathTo, displayName, PrBodyError, replaceMarkdown, STATUSES, t, updateMeta, versionMetrics, versionTag, type PullComment, type PullFile, type GitHubClient, type Host, type ResearchTree, type SectionChangeKind, type TreeNode, type VersionNode } from "@researchtree/core";
import { avatar } from "../avatar";
import { clear, h, icon } from "../dom";
import type { IntroDocs } from "./intro-docs";
import { changeList, fillHistory, fullView, orderedVersions, SpecStore, summaryView, versionRef } from "./spec-view";
import { renderMarkdown } from "../markdown";
import { formatDate, formatDelta, formatMetric, metricDirection, statusLabel, warningLabel } from "../theme";
import { formatVersionDate } from "../views/layout";

type Tab = "summary" | "collab" | "metrics" | "commits" | "files" | "spec";
type VersionTab = "overview" | "spec";
type SpecMode = "full" | "summary" | "changes";

/** Longest patch shown per file before pointing to GitHub. */
const PATCH_LINES = 400;

const WIDTH_KEY = "panelWidth";
const MIN_WIDTH = 320;

export interface PanelDeps {
  host: Host;
  gh: GitHubClient;
  onNavigate(id: string | null): void;
  /** Reload the tree after this panel wrote to GitHub (PR body edit). */
  onUpdated(message: string): Promise<void>;
  /** Label metric choices for an island (root or version id) and the current pick. */
  islandMetric(island: string): { keys: string[]; current: string | null };
  onIslandMetric(island: string, metric: string | null): void;
  /** Path of the spec document in this repo (from .researchtree, else SPEC.md). */
  specPath(): string;
  /** False for a guest reading a public repo: writing to GitHub needs a sign-in. */
  signedIn(): boolean;
  /** The panel just changed width: whatever shares the screen with it has to re-fit. */
  onResized?(): void;
}

/** Right-hand detail panel, modeled on the reference travel app's info panel. */
export class Panel {
  private tab: Tab = "summary";
  /** Which research document the intro panel is showing. */
  private introTab = "overview";
  private versionTab: VersionTab = "overview";
  private specMode: SpecMode = "full";
  private specStore: SpecStore | null = null;
  private node: TreeNode | null = null;
  private version: VersionNode | null = null;
  private tree: ResearchTree | null = null;
  /** Bumped on every render so late responses for another node or tab are dropped. */
  private loadToken = 0;
  /** The breadcrumb path is shown in full (it collapses to its last two lines when longer). */
  private pathOpen = false;
  /** Editing the hypothesis / conclusion in the summary tab. */
  private editing = false;
  /** Drag handle on the left edge; re-attached after every render (renders clear the panel). */
  private readonly resizer: HTMLElement;

  constructor(
    private readonly el: HTMLElement,
    private readonly deps: PanelDeps,
  ) {
    el.hidden = true;
    this.resizer = this.makeResizer();
    const saved = deps.host.storage.get<number>(WIDTH_KEY);
    if (saved) this.setWidth(saved);
  }

  /** Widest the panel may get: leave room for the tree on the left. */
  private maxWidth(): number {
    return Math.max(MIN_WIDTH, Math.min(960, window.innerWidth - 360));
  }

  private setWidth(px: number): number {
    const w = Math.round(Math.min(this.maxWidth(), Math.max(MIN_WIDTH, px)));
    this.el.style.setProperty("--panel-w", `${w}px`);
    this.deps.onResized?.();
    return w;
  }

  /** Desktop only (hidden by CSS on narrow screens): drag the left edge, or use arrow keys on it. */
  private makeResizer(): HTMLElement {
    const handle = h("div", {
      class: "panel-resizer",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": t("panel.resize"),
      title: t("panel.resize"),
      tabindex: "0",
    });
    const save = () => this.deps.host.storage.set(WIDTH_KEY, Math.round(this.el.getBoundingClientRect().width));
    handle.addEventListener("pointerdown", (e: PointerEvent) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const right = this.el.getBoundingClientRect().right;
      this.el.classList.add("resizing");
      const move = (ev: PointerEvent) => this.setWidth(right - ev.clientX);
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        this.el.classList.remove("resizing");
        save();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
    handle.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      e.stopPropagation();
      const w = this.el.getBoundingClientRect().width;
      this.setWidth(w + (e.key === "ArrowLeft" ? 24 : -24));
      save();
    });
    handle.addEventListener("dblclick", () => {
      this.el.style.removeProperty("--panel-w");
      this.deps.host.storage.set(WIDTH_KEY, undefined);
      this.deps.onResized?.();
    });
    return handle;
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /**
   * Screen the panel takes, measured to the edge it sits against, for a view that gives it room
   * rather than drawing under it (the board). `covered` keeps its own margin; this one does not.
   */
  get takes(): { right: number; bottom: number } {
    if (!this.isOpen) return { right: 0, bottom: 0 };
    const r = this.el.getBoundingClientRect();
    const style = getComputedStyle(this.el);
    const sheet = r.width > window.innerWidth * 0.7;
    // The panel slides in, so where it is right now is not where it will be: the edge it settles
    // against is its own offset from the screen, which the animation does not touch.
    if (sheet) return { right: 0, bottom: r.height + (parseFloat(style.bottom) || 0) };
    return { right: r.width + (parseFloat(style.right) || 0), bottom: 0 };
  }

  /** Canvas area covered by the panel: a right-hand column on desktop, a bottom sheet on narrow screens. */
  get covered(): { right: number; bottom: number } {
    if (!this.isOpen) return { right: 0, bottom: 0 };
    const r = this.el.getBoundingClientRect();
    const sheet = r.width > window.innerWidth * 0.7;
    return sheet ? { right: 0, bottom: window.innerHeight - r.top + 8 } : { right: r.width + 24, bottom: 0 };
  }

  show(node: TreeNode, tree: ResearchTree): void {
    if (this.node?.id !== node.id) {
      this.tab = "summary";
      this.editing = false;
    }
    this.node = node;
    this.version = null;
    this.tree = tree;
    this.el.hidden = false;
    this.render();
  }

  /**
   * What this research is, read off the repository itself: the README and the goal documents from
   * the root branch, and the intent and spec of the newest version (docs/ISLAND.md).
   */
  showIntro(tree: ResearchTree, docs: IntroDocs): void {
    this.node = null;
    this.version = null;
    this.tree = tree;
    this.el.hidden = false;
    clear(this.el);
    const entries = docs.entries;
    if (!entries.length) {
      this.el.append(
        this.head(t("intro.title"), null),
        h("div", { class: "panel-body" }, h("p", { class: "muted" }, docs.error ? t("intro.failed", { error: docs.error }) : t("intro.empty"))),
      );
      return;
    }
    if (!entries.some((e) => e.key === this.introTab)) this.introTab = entries[0]!.key;
    const current = entries.find((e) => e.key === this.introTab)!;
    const body = h("div", { class: "panel-body" });
    body.append(h("p", { class: "muted small" }, t("intro.source", { path: current.path, ref: current.ref })));
    const prose = h("div", { class: "prose" });
    prose.append(renderMarkdown(current.text));
    body.append(prose);
    this.el.append(
      this.head(t("intro.title"), tree.repo),
      this.tabBar(entries.map((e): [string, string] => [e.key, t(e.label as Parameters<typeof t>[0])]), this.introTab, (key) => {
        this.introTab = key;
        this.showIntro(tree, docs);
      }, true),
      body,
    );
  }

  showVersion(version: VersionNode, tree: ResearchTree): void {
    this.node = null;
    this.version = version;
    this.tree = tree;
    this.el.hidden = false;
    this.renderVersion();
  }

  hide(): void {
    this.el.hidden = true;
    this.node = null;
    this.version = null;
  }

  private crumbs(tree: ResearchTree, id: string): HTMLElement {
    // Returns the path plus its expand toggle.
    const crumbs = h("nav", { class: "crumbs", "aria-label": t("panel.path") });
    const path = [tree.root, ...pathTo(tree, id)];
    path.forEach((pid, i) => {
      if (i > 0) crumbs.append(h("span", { class: "sep" }, "›"));
      const last = i === path.length - 1;
      const label = pid === tree.root ? (tree.rootVersion ? `${pid} ${tree.rootVersion}` : pid) : displayName(tree, pid);
      crumbs.append(
        last
          ? h("span", { class: "crumb current" }, label)
          : h("button", { class: "crumb", onclick: () => this.deps.onNavigate(pid) }, label),
      );
    });
    // Long paths collapse to their last two lines (nearest ancestors and this node); a toggle on
    // the right expands them. Measured once the panel is on screen.
    const toggle = h("button", { class: "icon-btn crumbs-toggle", type: "button", hidden: true }, icon("down", 14));
    const wrap = h("div", { class: "crumbs-wrap" }, crumbs, toggle);
    const apply = () => {
      wrap.classList.toggle("collapsed", !this.pathOpen);
      toggle.setAttribute("aria-expanded", String(this.pathOpen));
      const label = t(this.pathOpen ? "panel.pathCollapse" : "panel.pathExpand");
      toggle.setAttribute("aria-label", label);
      toggle.title = label;
      if (!this.pathOpen) crumbs.scrollTop = crumbs.scrollHeight;
    };
    toggle.addEventListener("click", () => {
      this.pathOpen = !this.pathOpen;
      apply();
    });
    requestAnimationFrame(() => {
      const lineHeight = parseFloat(getComputedStyle(crumbs).lineHeight) || 20;
      if (crumbs.scrollHeight <= lineHeight * 2 + 6) return;
      toggle.hidden = false;
      apply();
    });
    return wrap;
  }

  private chipsFor(tree: ResearchTree, ids: readonly string[]): HTMLElement {
    return h(
      "div",
      { class: "chips" },
      ids.map((id) => {
        const c = tree.nodes.get(id);
        const v = tree.versions.get(id);
        return h(
          "button",
          { class: `chip child ${c ? `status-${c.status}` : "version"}`, onclick: () => this.deps.onNavigate(id) },
          h("span", { class: "chip-dot" }),
          v ? `${tree.root} ${v.name}` : displayName(tree, id),
        );
      }),
    );
  }

  /** The intro panel's header: the same shape as the version and experiment headers. */
  private head(title: string, eyebrow: string | null): HTMLElement {
    return h(
      "header",
      { class: "panel-head" },
      h(
        "div",
        { class: "panel-top" },
        h("div", { class: "eyebrow accent" }, eyebrow ?? t("intro.title")),
        h("button", { class: "icon-btn", "aria-label": t("common.close"), title: t("common.closeEsc"), onclick: () => this.deps.onNavigate(null) }, icon("close")),
      ),
      h("h2", { class: "panel-title" }, title),
    );
  }

  /** `sticky`: the panel's main tab bar, which stays at the top while the sheet scrolls on narrow screens. */
  private tabBar<T extends string>(tabs: [T, string][], current: T, pick: (key: T) => void, sticky = false): HTMLElement {
    const bar = h(
      "div",
      { class: "tabs", role: "tablist" },
      tabs.map(([key, label]) =>
        h("button", { class: "tab", role: "tab", "aria-selected": String(current === key), onclick: () => pick(key) }, label),
      ),
    );
    // The wrapper paints the card color around the bar, so text scrolling under it never shows through.
    return sticky ? h("div", { class: "panel-tabs" }, bar) : bar;
  }

  private store(tree: ResearchTree): SpecStore {
    const path = this.deps.specPath();
    if (!this.specStore || this.specStore.repo !== tree.repo || this.specStore.path !== path) this.specStore = new SpecStore(this.deps.gh, tree.repo, path);
    return this.specStore;
  }

  /** Panel for a research version milestone (or the root, which stands for the first version). */
  private renderVersion(): void {
    const v = this.version!;
    const tree = this.tree!;
    const isRoot = v.id === tree.root;
    clear(this.el);

    const header = h(
      "header",
      { class: "panel-head" },
      h(
        "div",
        { class: "panel-top" },
        h("div", { class: "eyebrow accent" }, t("panel.versionEyebrow")),
        h("button", { class: "icon-btn", "aria-label": t("common.close"), title: t("common.closeEsc"), onclick: () => this.deps.onNavigate(null) }, icon("close")),
      ),
      h("h2", { class: "panel-title" }, v.name ? `${tree.root} ${v.name}` : tree.root),
      isRoot ? null : this.crumbs(tree, v.id),
      h(
        "div",
        { class: "panel-meta" },
        h("span", { class: "pill version" }, h("span", { class: "pill-dot" }), t("panel.version")),
        v.sha ? h("code", { class: "branch" }, v.sha.slice(0, 7)) : null,
      ),
      v.date ? h("p", { class: "panel-sub" }, t("panel.tagged", { date: formatVersionDate(v.date) })) : null,
    );

    const tabs = this.tabBar<VersionTab>(
      [
        ["overview", t("panel.tabOverview")],
        ["spec", t("panel.tabSpec")],
      ],
      this.versionTab,
      (key) => {
        this.versionTab = key;
        this.renderVersion();
      },
      true,
    );
    const body = h("div", { class: "panel-body", role: "tabpanel" });
    ++this.loadToken;
    if (this.versionTab === "spec") this.renderVersionSpec(body, v, tree);
    else this.renderVersionOverview(body, v, tree);
    this.el.append(header, tabs, body, this.resizer);
  }

  private renderVersionOverview(body: HTMLElement, v: VersionNode, tree: ResearchTree): void {
    const isRoot = v.id === tree.root;
    const started = v.children.filter((id) => tree.nodes.has(id));
    const next = v.children.find((id) => tree.versions.has(id));
    const metrics = versionMetrics(tree, v.id) ?? {};
    const choice = this.deps.islandMetric(v.id);
    if (choice.keys.length) {
      const select = h(
        "select",
        {
          class: "select",
          "aria-label": t("panel.labelMetric"),
          onchange: (e: Event) => this.deps.onIslandMetric(v.id, (e.target as HTMLSelectElement).value || null),
        },
        h("option", { value: "", selected: choice.current === null }, t("panel.labelMetricNone")),
        choice.keys.map((k) => h("option", { value: k, selected: k === choice.current }, k)),
      );
      body.append(
        h("div", { class: "section-label" }, t("panel.labelMetric")),
        h("div", { class: "metric-pick" }, select, h("p", { class: "muted small" }, t("panel.labelMetricHint"))),
      );
    }
    if (!isRoot) {
      body.append(h("div", { class: "section-label" }, t("panel.mergedSection")));
      body.append(v.mergedFrom.length ? this.chipsFor(tree, v.mergedFrom) : h("p", { class: "muted small" }, t("panel.noMerged")));
    }

    const keys = Object.keys(metrics);
    if (keys.length) {
      body.append(h("div", { class: "section-label" }, t("panel.versionMetrics")));
      body.append(
        h(
          "table",
          { class: "mtable" },
          h("tbody", null, keys.map((k) => h("tr", null, h("th", { scope: "row" }, k), h("td", { class: "num" }, formatMetric(metrics[k]))))),
        ),
      );
    }

    body.append(h("div", { class: "section-label" }, t("panel.startedHere")));
    body.append(started.length ? this.chipsFor(tree, started) : h("p", { class: "muted small" }, t("panel.noStarted")));
    if (next) {
      body.append(h("div", { class: "section-label" }, t("panel.nextVersion")));
      body.append(this.chipsFor(tree, [next]));
    }
    body.append(
      h(
        "div",
        { class: "link-row" },
        h("button", { class: "link-btn", onclick: () => this.deps.host.openExternal(`https://github.com/${tree.repo}/tree/${v.name ? versionTag(tree.root, v.name) : tree.root}`) }, `${t("panel.viewOnGitHub")} `, icon("external", 13)),
      ),
    );
  }

  /** The spec as of this version: in full, as a one-page summary, or only what changed since the previous version. */
  private renderVersionSpec(body: HTMLElement, v: VersionNode, tree: ResearchTree): void {
    const token = this.loadToken;
    const store = this.store(tree);
    const versions = orderedVersions(tree);
    const i = versions.findIndex((x) => x.id === v.id);
    const prev = i > 0 ? versions[i - 1]! : null;
    const modes = this.tabBar<SpecMode>(
      [
        ["full", t("spec.modeFull")],
        ["summary", t("spec.modeSummary")],
        ["changes", t("spec.modeChanges")],
      ],
      this.specMode,
      (key) => {
        this.specMode = key;
        this.renderVersion();
      },
    );
    modes.classList.add("spec-modes");
    modes.setAttribute("aria-label", t("spec.modes"));
    const content = h("div", { class: "spec-view" }, h("p", { class: "muted small" }, t("spec.loading")));
    body.append(h("p", { class: "muted small spec-path" }, h("code", null, store.path), ` · ${versionRef(tree, v)}`), modes, content);

    Promise.all([store.at(versionRef(tree, v)), prev ? store.at(versionRef(tree, prev)) : Promise.resolve(null)])
      .then(([cur, before]) => {
        if (token !== this.loadToken) return;
        clear(content);
        if (!cur) {
          content.append(h("p", { class: "muted small" }, t("spec.none", { path: store.path })));
          return;
        }
        if (cur.missing.length) content.append(h("div", { class: "warn-box", role: "note" }, icon("warn", 16), h("span", null, t("spec.missing", { paths: cur.missing.join(", ") }))));
        const changes = prev ? diffSpecs(before?.sections ?? null, cur.sections) : [];
        const prevName = prev ? `${tree.root} ${prev.name}` : "";
        if (this.specMode === "summary") content.append(summaryView(cur));
        else if (this.specMode === "changes") {
          if (!prev) content.append(h("p", { class: "muted small" }, t("spec.firstVersion")));
          else {
            if (v.mergedFrom.length) content.append(h("div", { class: "section-label" }, t("spec.mergedHere")), this.chipsFor(tree, v.mergedFrom));
            content.append(h("p", { class: "files-summary" }, changes.length ? t("spec.since", { prev: prevName, n: changes.length }) : t("spec.noChanges", { prev: prevName })));
            if (changes.length) content.append(changeList(changes));
          }
        } else {
          const marks = new Map<string, SectionChangeKind>(changes.filter((c) => c.after).map((c) => [c.key, c.kind]));
          content.append(
            fullView(cur, marks, (key, box) => fillHistory(box, store, tree, key, (ids) => this.chipsFor(tree, ids), (id) => this.deps.onNavigate(id))),
          );
        }
      })
      .catch((e: unknown) => {
        if (token !== this.loadToken) return;
        clear(content);
        content.append(h("p", { class: "form-error" }, t("spec.failed", { error: this.errorText(e) })));
      });
  }

  /** What this experiment's branch changed in the spec, compared with where it forked. */
  private renderSpec(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const token = this.loadToken;
    const store = this.store(tree);
    const content = h("div", { class: "spec-view" }, h("p", { class: "muted small" }, t("spec.loading")));
    body.append(content);
    store
      .forExperiment(node)
      .then(({ fork, before, after }) => {
        if (token !== this.loadToken) return;
        clear(content);
        if (!before && !after) {
          content.append(h("p", { class: "muted small" }, t("spec.expNoFile", { path: store.path })));
          return;
        }
        const changes = diffSpecs(before?.sections ?? null, after?.sections ?? []);
        if (!changes.length) {
          content.append(h("p", { class: "muted small" }, t("spec.expNone")));
          return;
        }
        const outcome = node.status === "adopted" ? "spec.expAdopted" : node.status === "rejected" ? "spec.expRejected" : "spec.expRunning";
        content.append(h("p", { class: "muted small" }, t("spec.expIntro", { sha: fork.slice(0, 7) }), " ", t(outcome)), changeList(changes));
      })
      .catch((e: unknown) => {
        if (token !== this.loadToken) return;
        clear(content);
        content.append(h("p", { class: "form-error" }, t("spec.failed", { error: this.errorText(e) })));
      });
  }

  private render(): void {
    const node = this.node!;
    const tree = this.tree!;
    clear(this.el);

    const crumbs = this.crumbs(tree, node.id);

    const header = h(
      "header",
      { class: "panel-head" },
      h(
        "div",
        { class: "panel-top" },
        h("div", { class: "eyebrow accent" }, `Experiment · #${node.pr.number}`),
        h("button", { class: "icon-btn", "aria-label": t("common.close"), title: t("common.closeEsc"), onclick: () => this.deps.onNavigate(null) }, icon("close")),
      ),
      h("h2", { class: "panel-title" }, node.pr.title),
      crumbs,
      h(
        "div",
        { class: "panel-meta" },
        h("span", { class: `pill status-${node.status}` }, h("span", { class: "pill-dot" }), statusLabel(node.status)),
        node.pr.draft ? h("span", { class: "pill" }, statusLabel("draft")) : null,
        h("code", { class: "branch" }, node.id),
      ),
      h(
        "p",
        { class: "panel-sub" },
        `@${node.pr.author} · ${t("panel.started", { date: formatDate(node.pr.createdAt) })}`,
        node.pr.closedAt ? ` · ${t(node.pr.merged ? "panel.merged" : "panel.closed", { date: formatDate(node.pr.closedAt) })}` : "",
      ),
    );

    const tabBar = this.tabBar<Tab>(
      [
        ["summary", t("panel.tabSummary")],
        ["collab", t("panel.tabCollab")],
        ["metrics", t("panel.tabMetrics")],
        ["commits", t("panel.tabCommits")],
        ["files", t("panel.tabFiles")],
        ["spec", t("panel.tabSpec")],
      ],
      this.tab,
      (key) => {
        this.tab = key;
        this.render();
      },
      true,
    );

    const body = h("div", { class: "panel-body", role: "tabpanel" });
    ++this.loadToken;
    if (this.tab === "summary") {
      if (this.editing) this.renderEditor(body, node, tree);
      else this.renderSummary(body, node, tree);
    } else if (this.tab === "collab") this.renderCollab(body, node, tree);
    else if (this.tab === "metrics") this.renderMetrics(body, node, tree);
    else if (this.tab === "commits") this.renderCommits(body, node, tree);
    else if (this.tab === "spec") this.renderSpec(body, node, tree);
    else this.renderFiles(body, node, tree);

    this.el.append(header, tabBar, body, this.resizer);
  }

  private renderSummary(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const { host } = this.deps;
    if (node.warnings.length) {
      body.append(
        h(
          "div",
          { class: "warn-box", role: "note" },
          icon("warn", 16),
          h("ul", null, node.warnings.map((w) => h("li", null, warningLabel(w)))),
        ),
      );
    }

    body.append(h("div", { class: "section-label" }, t("panel.hypothesis")));
    body.append(h("p", { class: "lead" }, node.meta.hypothesis ?? t("panel.noHypothesis")));

    if (node.meta.change) {
      body.append(h("div", { class: "section-label" }, t("panel.change")));
      body.append(h("p", { class: "change" }, node.meta.change));
    }

    if (node.bodyMd) {
      body.append(h("div", { class: "section-label" }, t("panel.record")));
      body.append(this.prose(node.bodyMd));
    }

    if (node.meta.tags?.length) {
      body.append(h("div", { class: "tags" }, node.meta.tags.map((tag) => h("span", { class: "tag" }, `#${tag}`))));
    }

    const claims = claimsOf(node);
    if (claims.length) {
      body.append(h("div", { class: "tags" }, h("span", { class: "muted small" }, t("panel.claims")), claims.map((c) => h("span", { class: "tag claim" }, c))));
    }

    const actions = h(
      "div",
      { class: "link-row" },
      h("button", { class: "link-btn", onclick: () => host.openExternal(node.pr.url) }, `${t("panel.openOnGitHub")} `, icon("external", 13)),
      node.meta.wandb
        ? h("button", { class: "link-btn", onclick: () => host.openExternal(node.meta.wandb!) }, `${t("panel.wandb")} `, icon("external", 13))
        : null,
      this.deps.signedIn()
        ? h(
            "button",
            {
              class: "btn small link-row-end",
              title: t("panel.editTitle"),
              onclick: () => {
                this.editing = true;
                this.render();
              },
            },
            t("panel.edit"),
          )
        : h("span", { class: "muted small link-row-end" }, t("guest.readOnly")),
    );
    body.append(actions);

    const caps = host.capabilities;
    if (caps.checkout || caps.openDiff) {
      body.append(
        h(
          "div",
          { class: "row gap" },
          caps.checkout ? h("button", { class: "btn small", onclick: () => caps.checkout!(node.id) }, t("panel.checkout")) : null,
          caps.openDiff ? h("button", { class: "btn small", onclick: () => caps.openDiff!(node.parent, node.id) }, t("panel.diff")) : null,
        ),
      );
    }

    body.append(h("div", { class: "section-label" }, t("panel.children")));
    if (node.children.length === 0) {
      body.append(h("p", { class: "muted small" }, t("panel.noChildren")));
    } else {
      body.append(
        h(
          "div",
          { class: "chips" },
          node.children.map((id) => {
            const c = tree.nodes.get(id);
            const v = tree.versions.get(id);
            return h(
              "button",
              { class: `chip child ${c ? `status-${c.status}` : "version"}`, onclick: () => this.deps.onNavigate(id) },
              h("span", { class: "chip-dot" }),
              v ? `${tree.root} ${v.name}` : displayName(tree, id),
            );
          }),
        ),
      );
    }
  }

  private renderMetrics(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const cur = node.meta.metrics ?? {};
    const parentVersion = tree.versions.get(node.parent);
    const parentName = tree.nodes.has(node.parent) ? displayName(tree, node.parent) : parentVersion ? `${tree.root} ${parentVersion.name}` : null;
    const prev = parentMetrics(tree, node.id) ?? {};
    const keys = [...new Set([...Object.keys(cur), ...Object.keys(prev)])];
    if (keys.length === 0) {
      body.append(h("p", { class: "muted small pad" }, t("panel.noMetrics")));
      return;
    }
    const rows = keys.map((k) => {
      const d = formatDelta(cur[k], prev[k]);
      const dir = metricDirection(k);
      let cls = "delta";
      if (d && d.delta !== 0 && dir) cls += (dir === "lower") === d.delta < 0 ? " better" : " worse";
      return h(
        "tr",
        null,
        h("th", { scope: "row" }, k),
        h("td", { class: "num" }, formatMetric(cur[k])),
        h("td", { class: "num muted" }, formatMetric(prev[k])),
        h("td", { class: `num ${cls}` }, d ? d.text : ""),
      );
    });
    body.append(
      h(
        "table",
        { class: "mtable" },
        h(
          "thead",
          null,
          h("tr", null, h("th", null, t("panel.metric")), h("th", null, t("panel.thisExperiment")), h("th", null, parentName ?? t("panel.parent")), h("th", null, "Δ")),
        ),
        h("tbody", null, rows),
      ),
      h(
        "p",
        { class: "muted small" },
        parentVersion
          ? t("panel.deltaVersion", { parent: parentName ?? "" })
          : parentName
            ? t("panel.deltaParent", { parent: parentName })
            : t("panel.noParentMetrics"),
      ),
    );
  }

  /** Markdown from GitHub (untrusted): sanitized render, links open outside the app. */
  private prose(md: string): HTMLElement {
    const prose = h("div", { class: "prose" });
    prose.append(renderMarkdown(md));
    prose.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a?.href) {
        e.preventDefault();
        this.deps.host.openExternal(a.href);
      }
    });
    return prose;
  }

  private errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  /**
   * Edit the lab note without leaving the app: hypothesis, change, status, tags and W&B link in the
   * YAML block (other fields, comments and key order are kept), and the markdown body below it.
   */
  private renderEditor(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const area = (label: string, value: string, rows: number, mono = false) => {
      const input = h("textarea", { class: `input textarea${mono ? " mono" : ""}`, rows: String(rows), spellcheck: "false" }) as HTMLTextAreaElement;
      input.value = value;
      return { input, el: h("label", { class: "field" }, h("span", null, label), input) };
    };
    const line = (label: string, value: string, type = "text") => {
      const input = h("input", { class: "input", type, spellcheck: "false", autocomplete: "off" }) as HTMLInputElement;
      input.value = value;
      return { input, el: h("label", { class: "field" }, h("span", null, label), input) };
    };
    const hyp = area(t("panel.fieldHypothesis"), node.meta.hypothesis ?? "", 3);
    const chg = area(t("panel.fieldChange"), node.meta.change ?? "", 3);
    const status = h(
      "select",
      { class: "select" },
      h("option", { value: "", selected: !node.meta.status }, t("panel.statusAuto")),
      STATUSES.map((st) => h("option", { value: st, selected: node.meta.status === st }, statusLabel(st))),
    ) as HTMLSelectElement;
    const tags = line(t("panel.fieldTags"), (node.meta.tags ?? []).join(", "));
    const wandb = line(t("panel.fieldWandb"), node.meta.wandb ?? "", "url");
    const md = area(t("panel.fieldBody"), node.bodyMd, 12, true);
    const error = h("p", { class: "form-error", role: "alert", hidden: true });
    const save = h("button", { class: "btn primary", type: "submit" }, t("panel.save")) as HTMLButtonElement;
    const cancel = h(
      "button",
      {
        class: "btn",
        type: "button",
        onclick: () => {
          this.editing = false;
          this.render();
        },
      },
      t("common.cancel"),
    );
    const fail = (message: string) => {
      error.textContent = message;
      error.hidden = false;
      save.disabled = false;
      save.textContent = t("panel.save");
    };
    const form = h(
      "form",
      {
        class: "editor",
        onsubmit: async (e: SubmitEvent) => {
          e.preventDefault();
          const link = wandb.input.value.trim();
          if (link && !/^https?:\/\//i.test(link)) return fail(t("panel.badUrl"));
          save.disabled = true;
          save.textContent = t("panel.saving");
          error.hidden = true;
          try {
            // Guard against overwriting an edit made on GitHub since the tree was loaded.
            const fresh = await this.deps.gh.getPull(tree.repo, node.pr.number);
            if ((fresh.body ?? "") !== node.rawBody) throw new Error(t("panel.conflict"));
            const tagList = tags.input.value.split(",").map((x) => x.trim()).filter(Boolean);
            let next = updateMeta(fresh.body, {
              hypothesis: hyp.input.value.trim() || null,
              change: chg.input.value.trim() || null,
              status: (status.value || null) as (typeof STATUSES)[number] | null,
              tags: tagList.length ? tagList : null,
              wandb: link || null,
            });
            if (md.input.value.trim() !== node.bodyMd.trim()) next = replaceMarkdown(next, md.input.value);
            if (next !== fresh.body) await this.deps.gh.updatePullBody(tree.repo, node.pr.number, next);
            this.editing = false;
            await this.deps.onUpdated(t("panel.saved"));
          } catch (err) {
            fail(err instanceof PrBodyError ? err.message : t("panel.saveFailed", { error: this.errorText(err) }));
          }
        },
      },
      h("div", { class: "section-label" }, t("panel.editTitle")),
      hyp.el,
      chg.el,
      h("div", { class: "field-row" }, h("label", { class: "field" }, h("span", null, t("panel.fieldStatus")), status), wandb.el),
      tags.el,
      md.el,
      h("p", { class: "muted small" }, t("panel.editHint")),
      error,
      h("div", { class: "row gap" }, save, cancel),
    );
    body.append(form);
    hyp.input.focus();
  }

  /** PR conversation: comments and inline review comments, plus a box to add one. */
  private renderCollab(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const token = this.loadToken;
    const list = h("div", { class: "comments" }, h("p", { class: "muted small" }, t("panel.commentsLoading")));
    const load = () =>
      this.deps.gh
        .listPullComments(tree.repo, node.pr.number)
        .then((comments) => {
          if (token !== this.loadToken) return;
          clear(list);
          if (comments.length === 0) list.append(h("p", { class: "muted small" }, t("panel.noComments")));
          for (const c of comments) list.append(this.comment(c));
        })
        .catch((e: unknown) => {
          if (token !== this.loadToken) return;
          clear(list);
          list.append(h("p", { class: "form-error" }, t("panel.commentsFailed", { error: this.errorText(e) })));
        });

    const area = h("textarea", { class: "input textarea", rows: "3", placeholder: t("panel.commentPlaceholder") }) as HTMLTextAreaElement;
    const error = h("p", { class: "form-error", role: "alert", hidden: true });
    const submit = h("button", { class: "btn primary small", type: "submit" }, t("panel.commentSubmit")) as HTMLButtonElement;
    const form = h(
      "form",
      {
        class: "comment-form",
        onsubmit: async (e: SubmitEvent) => {
          e.preventDefault();
          const text = area.value.trim();
          if (!text) return;
          submit.disabled = true;
          submit.textContent = t("panel.commentPosting");
          error.hidden = true;
          try {
            await this.deps.gh.addPullComment(tree.repo, node.pr.number, text);
            area.value = "";
            await load();
          } catch (err) {
            error.textContent = t("panel.commentFailed", { error: this.errorText(err) });
            error.hidden = false;
          } finally {
            submit.disabled = false;
            submit.textContent = t("panel.commentSubmit");
          }
        },
      },
      area,
      error,
      h("div", { class: "row end" }, submit),
    );
    body.append(list, this.deps.signedIn() ? form : h("p", { class: "muted small" }, t("guest.commentNeedsSignIn")));
    void load();
  }

  private comment(c: PullComment): HTMLElement {
    return h(
      "article",
      { class: "comment" },
      h(
        "header",
        { class: "comment-head" },
        c.user?.avatar_url ? avatar(c.user.avatar_url, 20) : null,
        h("strong", null, c.user?.login ?? "unknown"),
        h("span", { class: "muted small" }, formatDate(c.created_at)),
        c.path
          ? h("button", { class: "comment-path", onclick: () => this.deps.host.openExternal(c.html_url) }, t("panel.reviewOn", { path: c.path }))
          : null,
      ),
      this.prose(c.body),
    );
  }

  /** "Files changed": per-file stats and the unified diff, collapsed by default. */
  private renderFiles(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const token = this.loadToken;
    const list = h("div", { class: "files" }, h("p", { class: "muted small" }, t("panel.filesLoading")));
    body.append(list);
    this.deps.gh
      .listPullFiles(tree.repo, node.pr.number)
      .then((files) => {
        if (token !== this.loadToken) return;
        clear(list);
        if (files.length === 0) {
          list.append(h("p", { class: "muted small" }, t("panel.noFiles")));
          return;
        }
        const add = files.reduce((n, f) => n + f.additions, 0);
        const del = files.reduce((n, f) => n + f.deletions, 0);
        list.append(h("p", { class: "files-summary" }, t("panel.filesSummary", { n: files.length, add, del })));
        for (const f of files) list.append(this.file(f));
      })
      .catch((e: unknown) => {
        if (token !== this.loadToken) return;
        clear(list);
        list.append(h("p", { class: "form-error" }, t("panel.filesFailed", { error: this.errorText(e) })));
      });
  }

  private file(f: PullFile): HTMLElement {
    const status: Record<string, string> = {
      added: t("panel.fileAdded"),
      removed: t("panel.fileRemoved"),
      renamed: t("panel.fileRenamed"),
    };
    const summary = h(
      "summary",
      { class: "file-head" },
      h("span", { class: `file-status ${f.status}` }, status[f.status] ?? t("panel.fileModified")),
      h("span", { class: "file-name", title: f.filename }, f.previous_filename ? `${f.previous_filename} → ${f.filename}` : f.filename),
      h("span", { class: "file-stat" }, h("span", { class: "add" }, `+${f.additions}`), " ", h("span", { class: "del" }, `−${f.deletions}`)),
    );
    const details = h("details", { class: "file" }, summary);
    // Build the diff lazily when opened: large PRs can have thousands of lines.
    details.addEventListener(
      "toggle",
      () => {
        if (!details.open || details.querySelector(".patch, .muted")) return;
        if (!f.patch) {
          details.append(h("p", { class: "muted small file-pad" }, t("panel.noPatch")));
        } else {
          const lines = f.patch.split("\n");
          const pre = h("pre", { class: "patch" });
          for (const line of lines.slice(0, PATCH_LINES)) {
            const cls = line.startsWith("@@") ? "hunk" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
            pre.append(h("span", { class: `pl ${cls}` }, line || " "));
          }
          details.append(pre);
          if (lines.length > PATCH_LINES) details.append(h("p", { class: "muted small file-pad" }, t("panel.patchTruncated", { n: PATCH_LINES })));
        }
        details.append(
          h("div", { class: "link-row file-pad" }, h("button", { class: "link-btn", onclick: () => this.deps.host.openExternal(f.blob_url) }, `${t("panel.viewFile")} `, icon("external", 13))),
        );
      },
    );
    return details;
  }

  private renderCommits(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const token = this.loadToken;
    const list = h("div", { class: "commits" }, h("p", { class: "muted small" }, t("panel.commitsLoading")));
    body.append(list);
    this.deps.gh
      .listCommits(tree.repo, node.pr.number)
      .then((commits) => {
        if (token !== this.loadToken) return;
        clear(list);
        if (commits.length === 0) list.append(h("p", { class: "muted small" }, t("panel.noCommits")));
        for (const c of [...commits].reverse()) {
          list.append(
            h(
              "button",
              { class: "commit", onclick: () => this.deps.host.openExternal(c.html_url) },
              h("code", null, c.sha.slice(0, 7)),
              h("span", { class: "commit-msg" }, c.commit.message.split("\n")[0] ?? ""),
              h("span", { class: "muted small" }, `${c.commit.author?.name ?? ""} · ${formatDate(c.commit.author?.date)}`),
            ),
          );
        }
      })
      .catch((e: unknown) => {
        if (token !== this.loadToken) return;
        clear(list);
        list.append(h("p", { class: "form-error" }, t("panel.commitsFailed", { error: this.errorText(e) })));
      });
  }
}

/** Intent claim ids an experiment tests (YAML `claims:`, a list or a single value). */
function claimsOf(node: TreeNode): string[] {
  const raw = node.meta["claims"];
  const items = Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === "" ? [] : [raw];
  return items.map((c) => String(c).trim()).filter(Boolean);
}
