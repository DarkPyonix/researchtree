import "./styles.css";
import {
  buildTree,
  DEFAULT_TREE_CONFIG,
  GitHubClient,
  HttpError,
  metricKeys,
  parseRepo,
  STATUSES,
  type GitHubUser,
  type Host,
  type ResearchTree,
  type Status,
} from "@researchtree/core";
import { append, clear, h, icon } from "./dom";
import { Panel } from "./panel/panel";
import { loadingScreen, loginScreen, messageScreen, repoPicker } from "./screens";
import { STATUS_LABEL } from "./theme";
import { TreeView } from "./views/tree2d";

const RECENT_KEY = "recentRepos";
const LAST_KEY = "lastRepo";
const METRIC_KEY = "labelMetric";

/** Start the viewer on the given host (web / extension / local / demo). */
export async function startApp(host: Host, root: HTMLElement): Promise<void> {
  document.body.classList.add(`host-${host.kind}`);
  await new App(host, root).boot();
}

function urlParam(name: string): string | null {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

class App {
  private readonly gh: GitHubClient;
  private user: GitHubUser | null = null;
  private tree: ResearchTree | null = null;
  private view: TreeView | null = null;
  private panel: Panel | null = null;
  private selected: string | null = null;
  private hidden = new Set<Status>();
  private metric: string | null;
  private shell: {
    brand: HTMLElement;
    gens: HTMLElement;
    toast: HTMLElement;
  } | null = null;
  private activeDepth: number | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private readonly host: Host,
    private readonly root: HTMLElement,
  ) {
    this.gh = new GitHubClient(host);
    this.metric = host.storage.get<string>(METRIC_KEY) ?? null;
  }

  private mount(el: HTMLElement): void {
    if (this.keyHandler) document.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
    this.view = null;
    this.panel = null;
    this.shell = null;
    clear(this.root);
    this.root.append(el);
  }

  async boot(loginError?: string): Promise<void> {
    this.mount(loadingScreen("불러오는 중…"));
    try {
      this.user = await this.host.auth.current();
    } catch (e) {
      this.mount(
        messageScreen({
          title: "GitHub에 연결할 수 없습니다",
          body: [errorText(e), "네트워크 상태를 확인하고 다시 시도해 주세요."],
          actions: [{ label: "다시 시도", primary: true, onClick: () => void this.boot() }],
        }),
      );
      return;
    }
    if (!this.user) return this.showLogin(loginError);

    const repo = urlParam("repo") ?? (await this.host.initialRepo()) ?? this.host.storage.get<string>(LAST_KEY) ?? null;
    if (!repo) return this.showPicker();
    await this.openRepo(repo);
  }

  private showLogin(error?: string): void {
    this.mount(loginScreen({ host: this.host, error, onSignedIn: () => void this.boot() }));
  }

  private showPicker(error?: string): void {
    this.mount(
      repoPicker({
        gh: this.gh,
        user: this.user!,
        recent: this.host.storage.get<string[]>(RECENT_KEY) ?? [],
        error,
        onPick: (repo) => void this.openRepo(repo),
        onSignOut: () => void this.signOut(),
      }),
    );
  }

  private async signOut(): Promise<void> {
    await this.host.auth.signOut();
    this.user = null;
    this.setUrl({ repo: null, node: null });
    this.showLogin();
  }

  private handleError(e: unknown, repo: string): void {
    if (e instanceof HttpError && e.status === 401) {
      void this.host.auth.signOut().then(() => this.showLogin("로그인이 만료되었습니다. 다시 로그인해 주세요."));
      return;
    }
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) {
      this.showPicker(`${repo} 레포를 찾을 수 없거나 접근 권한이 없습니다.`);
      return;
    }
    this.mount(
      messageScreen({
        title: "트리를 불러오지 못했습니다",
        body: [errorText(e)],
        actions: [
          { label: "다시 시도", primary: true, onClick: () => void this.openRepo(repo) },
          { label: "다른 레포", onClick: () => this.showPicker() },
        ],
      }),
    );
  }

  private async openRepo(repo: string): Promise<void> {
    if (!parseRepo(repo)) return this.showPicker("owner/name 형식이 아닙니다.");
    this.mount(loadingScreen(`${repo} 불러오는 중…`));
    try {
      if (!(await this.gh.branchExists(repo, DEFAULT_TREE_CONFIG.root))) {
        this.mount(
          messageScreen({
            eyebrow: repo,
            title: `${DEFAULT_TREE_CONFIG.root} 브랜치가 없습니다`,
            body: [
              `ResearchTree는 ${DEFAULT_TREE_CONFIG.root} 브랜치를 연구 트리의 루트로 씁니다.`,
              h("pre", { class: "code" }, `git switch -c ${DEFAULT_TREE_CONFIG.root}\ngit push -u origin ${DEFAULT_TREE_CONFIG.root}`),
              `그다음 실험은 ${DEFAULT_TREE_CONFIG.prefix}<이름> 브랜치에서 PR로 기록합니다.`,
            ],
            actions: [
              { label: "다시 확인", primary: true, onClick: () => void this.openRepo(repo) },
              { label: "다른 레포", onClick: () => this.showPicker() },
            ],
          }),
        );
        return;
      }
      const prs = await this.gh.listPulls(repo);
      this.tree = buildTree(prs, repo);
    } catch (e) {
      this.handleError(e, repo);
      return;
    }

    this.host.storage.set(LAST_KEY, repo);
    const recent = [repo, ...(this.host.storage.get<string[]>(RECENT_KEY) ?? []).filter((r) => r !== repo)].slice(0, 6);
    this.host.storage.set(RECENT_KEY, recent);
    if (this.metric && !metricKeys(this.tree).includes(this.metric)) this.metric = null;
    this.metric ??= metricKeys(this.tree)[0] ?? null;

    this.renderMain();
    const want = urlParam("node");
    this.select(want && this.tree.nodes.has(want) ? want : null, false);
    this.setUrl({ repo, node: this.selected });
  }

  private async refresh(): Promise<void> {
    if (!this.tree) return;
    const repo = this.tree.repo;
    this.gh.invalidate();
    try {
      this.tree = buildTree(await this.gh.listPulls(repo), repo);
    } catch (e) {
      this.toast(`새로고침 실패: ${errorText(e)}`);
      return;
    }
    this.renderBrand();
    this.renderGenerations();
    this.view!.render(this.tree, this.filter());
    const sel = this.selected && this.tree.nodes.has(this.selected) ? this.selected : null;
    this.select(sel, false);
    this.toast("최신 상태로 갱신했습니다.");
  }

  private filter() {
    return { hidden: this.hidden, metric: this.metric };
  }

  private renderMain(): void {
    const canvas = h("div", { class: "canvas" });
    const brand = h("section", { class: "card brand", "aria-label": "레포 정보" });
    const panelEl = h("aside", { class: "card panel", "aria-label": "실험 상세" });
    const gens = h("nav", { class: "card gens", "aria-label": "세대 이동" });
    const toast = h("div", { class: "toast", role: "status", "aria-live": "polite" });
    const toolbar = this.renderToolbar();
    const hint = h("div", { class: "hint" }, "드래그 이동 · 휠 확대 · 방향키로 노드 이동 · Esc 닫기");

    this.mount(h("div", { class: "shell" }, canvas, brand, toolbar, panelEl, gens, hint, toast));
    this.shell = { brand, gens, toast };

    this.panel = new Panel(panelEl, {
      host: this.host,
      gh: this.gh,
      onNavigate: (id) => this.select(id),
    });
    this.view = new TreeView(canvas, {
      onSelect: (id) => this.select(id),
      insets: () => {
        const panel = this.panel?.covered ?? { right: 0, bottom: 0 };
        // On narrow screens the brand card spans the full width, so keep the tree below it.
        const b = brand.getBoundingClientRect();
        const top = b.width > window.innerWidth * 0.6 ? b.bottom + 8 : 16;
        return { top, left: 16, right: panel.right, bottom: Math.max(88, panel.bottom) };
      },
    });

    this.renderBrand();
    this.renderGenerations();
    this.view.render(this.tree!, this.filter());

    this.keyHandler = (e) => this.onKey(e);
    document.addEventListener("keydown", this.keyHandler);
  }

  private renderToolbar(): HTMLElement {
    const btn = (label: string, iconName: Parameters<typeof icon>[0], onClick: () => void, title?: string) =>
      h("button", { class: "btn", onclick: onClick, title: title ?? label, "aria-label": title ?? label }, icon(iconName, 15), h("span", { class: "btn-label" }, label));

    const userEl =
      this.host.kind === "demo"
        ? h("a", { class: "btn primary", href: location.pathname }, "내 레포 보기")
        : h(
            "details",
            { class: "user-menu" },
            h(
              "summary",
              { class: "btn", "aria-label": "계정" },
              this.user?.avatar_url ? h("img", { class: "avatar", src: this.user.avatar_url, alt: "" }) : null,
              h("span", { class: "btn-label" }, `@${this.user?.login ?? ""}`),
            ),
            h(
              "div",
              { class: "card menu" },
              h("button", { class: "menu-item", onclick: () => this.showPicker() }, icon("repo", 14), " 다른 레포 열기"),
              h("button", { class: "menu-item", onclick: () => void this.signOut() }, icon("logout", 14), " 로그아웃"),
            ),
          );

    return h(
      "div",
      { class: "toolbar" },
      this.host.kind === "demo" ? h("span", { class: "pill demo" }, "데모 데이터") : null,
      btn("새로고침", "refresh", () => void this.refresh()),
      btn("전체 보기", "fit", () => {
        this.activeDepth = null;
        this.renderGenerations();
        this.view?.fit();
      }),
      userEl,
    );
  }

  private renderBrand(): void {
    const brand = this.shell!.brand;
    const tree = this.tree!;
    clear(brand);
    const [owner, name] = tree.repo.split("/");
    const nodes = [...tree.nodes.values()];
    const count = (s: Status) => nodes.filter((n) => n.status === s).length;
    const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
    const keys = metricKeys(tree);

    const layers = h(
      "div",
      { class: "layers", role: "group", "aria-label": "상태 레이어" },
      STATUSES.map((s) =>
        h(
          "button",
          {
            class: `chip layer status-${s}`,
            "aria-pressed": String(!this.hidden.has(s)),
            title: this.hidden.has(s) ? `${STATUS_LABEL[s]} 실험 보이기` : `${STATUS_LABEL[s]} 실험 흐리게`,
            onclick: () => {
              if (this.hidden.has(s)) this.hidden.delete(s);
              else this.hidden.add(s);
              this.renderBrand();
              this.view?.render(this.tree!, this.filter());
              this.view?.select(this.selected, false);
            },
          },
          h("span", { class: "chip-dot" }),
          STATUS_LABEL[s],
          h("span", { class: "chip-count" }, count(s)),
        ),
      ),
    );

    const select = h(
      "select",
      {
        class: "select",
        "aria-label": "라벨에 표시할 메트릭",
        onchange: (e: Event) => {
          this.metric = (e.target as HTMLSelectElement).value || null;
          this.host.storage.set(METRIC_KEY, this.metric ?? undefined);
          this.view?.render(this.tree!, this.filter());
          this.view?.select(this.selected, false);
        },
      },
      h("option", { value: "" }, "표시 안 함"),
      keys.map((k) => h("option", { value: k, selected: k === this.metric }, k)),
    );

    append(brand, [
      h("div", { class: "eyebrow" }, `Research Tree · ${owner}`),
      h("div", { class: "brand-title" }, h("span", { class: "count" }, String(nodes.length).padStart(2, "0")), h("h1", null, name)),
      h(
        "p",
        { class: "brand-sub" },
        nodes.length
          ? `${tree.root}에서 뻗은 가지 ${tree.rootChildren.length}개 · 최대 ${maxDepth}세대`
          : `아직 ${DEFAULT_TREE_CONFIG.prefix}* PR이 없습니다. 첫 실험 브랜치를 ${tree.root}에서 따서 PR을 열어 보세요.`,
      ),
      layers,
      keys.length ? h("label", { class: "metric-row" }, h("span", null, "라벨 메트릭"), select) : null,
    ]);
  }

  private renderGenerations(): void {
    const gens = this.shell!.gens;
    const tree = this.tree!;
    clear(gens);
    const maxDepth = Math.max(0, ...[...tree.nodes.values()].map((n) => n.depth));
    if (maxDepth === 0) {
      gens.hidden = true;
      return;
    }
    gens.hidden = false;
    const go = (d: number | null) => {
      this.activeDepth = d;
      this.renderGenerations();
      if (d === null) this.view?.fit();
      else this.view?.fit([...tree.nodes.values()].filter((n) => n.depth === d).map((n) => n.id), true, 1.2);
    };
    const cur = this.activeDepth;
    gens.append(
      h("span", { class: "gens-label" }, "세대"),
      h("button", { class: "icon-btn", "aria-label": "이전 세대", disabled: cur === null || cur <= 1, onclick: () => go(Math.max(1, (cur ?? 1) - 1)) }, icon("left")),
      ...Array.from({ length: maxDepth }, (_, i) => i + 1).map((d) =>
        h("button", { class: `gen-btn${cur === d ? " active" : ""}`, "aria-pressed": String(cur === d), onclick: () => go(d) }, String(d).padStart(2, "0")),
      ),
      h("button", { class: "icon-btn", "aria-label": "다음 세대", disabled: cur === maxDepth, onclick: () => go(Math.min(maxDepth, (cur ?? 0) + 1)) }, icon("right")),
    );
  }

  private select(id: string | null, focus = true): void {
    const tree = this.tree;
    if (!tree || !this.view || !this.panel) return;
    const node = id ? tree.nodes.get(id) : undefined;
    this.selected = node ? node.id : null;
    if (node) this.panel.show(node, tree);
    else this.panel.hide();
    this.shell?.brand.parentElement?.classList.toggle("panel-open", Boolean(node));
    this.view.select(this.selected, focus);
    this.setUrl({ repo: tree.repo, node: this.selected });
  }

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)) return;
    const tree = this.tree;
    if (!tree) return;
    const cur = this.selected ? tree.nodes.get(this.selected) : undefined;
    const siblings = cur ? (cur.parent === tree.root ? tree.rootChildren : tree.nodes.get(cur.parent)?.children ?? []) : tree.rootChildren;
    let next: string | null | undefined;

    switch (e.key) {
      case "Escape":
        next = null;
        break;
      case "ArrowRight":
        next = cur ? cur.children[0] : tree.rootChildren[0];
        break;
      case "ArrowLeft":
        next = cur && cur.parent !== tree.root ? cur.parent : undefined;
        break;
      case "ArrowDown":
      case "ArrowUp": {
        if (!cur) {
          next = tree.rootChildren[0];
          break;
        }
        const i = siblings.indexOf(cur.id) + (e.key === "ArrowDown" ? 1 : -1);
        next = siblings[i];
        break;
      }
      default:
        return;
    }
    if (next === undefined) return;
    e.preventDefault();
    this.select(next);
    if (next) this.view?.focusNode(next);
  }

  private setUrl(p: { repo: string | null; node: string | null }): void {
    if (this.host.kind === "extension") return;
    try {
      const params = new URLSearchParams(location.search);
      for (const k of ["code", "state"]) params.delete(k);
      if (p.repo && this.host.kind !== "demo") params.set("repo", p.repo);
      else params.delete("repo");
      if (p.node) params.set("node", p.node);
      else params.delete("node");
      const q = params.toString().replace(/=(&|$)/g, "$1");
      history.replaceState(null, "", location.pathname + (q ? `?${q}` : ""));
    } catch {
      /* Ignore environments where the URL cannot be changed. */
    }
  }

  private toastTimer = 0;
  private toast(msg: string): void {
    const el = this.shell?.toast;
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove("show"), 2600);
  }
}
