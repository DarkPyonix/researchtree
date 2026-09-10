import { pathTo, shortName, type GitHubClient, type Host, type ResearchTree, type TreeNode } from "@researchtree/core";
import { clear, h, icon } from "../dom";
import { renderMarkdown } from "../markdown";
import { formatDate, formatDelta, formatMetric, metricDirection, STATUS_LABEL, WARNING_LABEL } from "../theme";

type Tab = "summary" | "metrics" | "commits";

export interface PanelDeps {
  host: Host;
  gh: GitHubClient;
  onNavigate(id: string | null): void;
}

/** Right-hand detail panel, modeled on the reference travel app's info panel. */
export class Panel {
  private tab: Tab = "summary";
  private node: TreeNode | null = null;
  private tree: ResearchTree | null = null;
  private commitsToken = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly deps: PanelDeps,
  ) {
    el.hidden = true;
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Canvas area covered by the panel: a right-hand column on desktop, a bottom sheet on narrow screens. */
  get covered(): { right: number; bottom: number } {
    if (!this.isOpen) return { right: 0, bottom: 0 };
    const r = this.el.getBoundingClientRect();
    const sheet = r.width > window.innerWidth * 0.7;
    return sheet ? { right: 0, bottom: window.innerHeight - r.top + 8 } : { right: r.width + 24, bottom: 0 };
  }

  show(node: TreeNode, tree: ResearchTree): void {
    if (this.node?.id !== node.id) this.tab = "summary";
    this.node = node;
    this.tree = tree;
    this.el.hidden = false;
    this.render();
  }

  hide(): void {
    this.el.hidden = true;
    this.node = null;
  }

  private render(): void {
    const node = this.node!;
    const tree = this.tree!;
    clear(this.el);

    const crumbs = h("nav", { class: "crumbs", "aria-label": "경로" });
    const path = [tree.root, ...pathTo(tree, node.id)];
    path.forEach((id, i) => {
      if (i > 0) crumbs.append(h("span", { class: "sep" }, "›"));
      const last = i === path.length - 1;
      const label = id === tree.root ? id : shortName(id);
      crumbs.append(
        last
          ? h("span", { class: "crumb current" }, label)
          : h("button", { class: "crumb", onclick: () => this.deps.onNavigate(id === tree.root ? null : id) }, label),
      );
    });

    const header = h(
      "header",
      { class: "panel-head" },
      h(
        "div",
        { class: "panel-top" },
        h("div", { class: "eyebrow accent" }, `Experiment · #${node.pr.number}`),
        h("button", { class: "icon-btn", "aria-label": "닫기", title: "닫기 (Esc)", onclick: () => this.deps.onNavigate(null) }, icon("close")),
      ),
      h("h2", { class: "panel-title" }, node.pr.title),
      crumbs,
      h(
        "div",
        { class: "panel-meta" },
        h("span", { class: `pill status-${node.status}` }, h("span", { class: "pill-dot" }), STATUS_LABEL[node.status]),
        node.pr.draft ? h("span", { class: "pill" }, "초안") : null,
        h("code", { class: "branch" }, node.id),
      ),
      h(
        "p",
        { class: "panel-sub" },
        `@${node.pr.author} · ${formatDate(node.pr.createdAt)} 시작`,
        node.pr.closedAt ? ` · ${formatDate(node.pr.closedAt)} ${node.pr.merged ? "머지" : "종료"}` : "",
      ),
    );

    const tabs: [Tab, string][] = [
      ["summary", "가설 · 결론"],
      ["metrics", "메트릭"],
      ["commits", "커밋"],
    ];
    const tabBar = h(
      "div",
      { class: "tabs", role: "tablist" },
      tabs.map(([key, label]) =>
        h(
          "button",
          {
            class: "tab",
            role: "tab",
            "aria-selected": String(this.tab === key),
            onclick: () => {
              this.tab = key;
              this.render();
            },
          },
          label,
        ),
      ),
    );

    const body = h("div", { class: "panel-body", role: "tabpanel" });
    if (this.tab === "summary") this.renderSummary(body, node, tree);
    else if (this.tab === "metrics") this.renderMetrics(body, node, tree);
    else this.renderCommits(body, node, tree);

    this.el.append(header, tabBar, body);
  }

  private renderSummary(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const { host } = this.deps;
    if (node.warnings.length) {
      body.append(
        h(
          "div",
          { class: "warn-box", role: "note" },
          icon("warn", 16),
          h("ul", null, node.warnings.map((w) => h("li", null, WARNING_LABEL[w]))),
        ),
      );
    }

    body.append(h("div", { class: "section-label" }, "가설 · 무엇을 확인하나"));
    body.append(h("p", { class: "lead" }, node.meta.hypothesis ?? "가설이 적혀 있지 않습니다."));

    if (node.meta.change) {
      body.append(h("div", { class: "section-label" }, "변경 · 무엇을 바꿨나"));
      body.append(h("p", { class: "change" }, node.meta.change));
    }

    if (node.bodyMd) {
      body.append(h("div", { class: "section-label" }, "기록 · PR 본문"));
      const prose = h("div", { class: "prose" });
      prose.append(renderMarkdown(node.bodyMd));
      prose.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (a?.href) {
          e.preventDefault();
          host.openExternal(a.href);
        }
      });
      body.append(prose);
    }

    if (node.meta.tags?.length) {
      body.append(h("div", { class: "tags" }, node.meta.tags.map((t) => h("span", { class: "tag" }, `#${t}`))));
    }

    const actions = h(
      "div",
      { class: "link-row" },
      h("button", { class: "link-btn", onclick: () => host.openExternal(node.pr.url) }, "GitHub에서 열기 ", icon("external", 13)),
      node.meta.wandb
        ? h("button", { class: "link-btn", onclick: () => host.openExternal(node.meta.wandb!) }, "학습 기록 ", icon("external", 13))
        : null,
    );
    body.append(actions);

    const caps = host.capabilities;
    if (caps.checkout || caps.openDiff) {
      body.append(
        h(
          "div",
          { class: "row gap" },
          caps.checkout ? h("button", { class: "btn small", onclick: () => caps.checkout!(node.id) }, "체크아웃") : null,
          caps.openDiff ? h("button", { class: "btn small", onclick: () => caps.openDiff!(node.parent, node.id) }, "부모 대비 diff") : null,
        ),
      );
    }

    body.append(h("div", { class: "section-label" }, "파생 실험"));
    if (node.children.length === 0) {
      body.append(h("p", { class: "muted small" }, "아직 이 실험에서 파생된 실험이 없습니다."));
    } else {
      body.append(
        h(
          "div",
          { class: "chips" },
          node.children.map((id) => {
            const c = tree.nodes.get(id)!;
            return h(
              "button",
              { class: `chip child status-${c.status}`, onclick: () => this.deps.onNavigate(id) },
              h("span", { class: "chip-dot" }),
              shortName(id),
            );
          }),
        ),
      );
    }
  }

  private renderMetrics(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const cur = node.meta.metrics ?? {};
    const parent = tree.nodes.get(node.parent);
    const prev = parent?.meta.metrics ?? {};
    const keys = [...new Set([...Object.keys(cur), ...Object.keys(prev)])];
    if (keys.length === 0) {
      body.append(h("p", { class: "muted small pad" }, "기록된 메트릭이 없습니다. PR 본문 YAML의 metrics에 값을 적어 주세요."));
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
          h("tr", null, h("th", null, "지표"), h("th", null, "이 실험"), h("th", null, parent ? shortName(parent.id) : "부모"), h("th", null, "Δ")),
        ),
        h("tbody", null, rows),
      ),
      h(
        "p",
        { class: "muted small" },
        parent ? `부모 실험(${shortName(parent.id)}) 대비 변화입니다.` : "research 직속 실험이라 비교할 부모 메트릭이 없습니다.",
      ),
    );
  }

  private renderCommits(body: HTMLElement, node: TreeNode, tree: ResearchTree): void {
    const token = ++this.commitsToken;
    const list = h("div", { class: "commits" }, h("p", { class: "muted small" }, "커밋을 불러오는 중…"));
    body.append(list);
    this.deps.gh
      .listCommits(tree.repo, node.pr.number)
      .then((commits) => {
        if (token !== this.commitsToken) return;
        clear(list);
        if (commits.length === 0) list.append(h("p", { class: "muted small" }, "커밋이 없습니다."));
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
        if (token !== this.commitsToken) return;
        clear(list);
        list.append(h("p", { class: "form-error" }, `커밋을 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`));
      });
  }
}
