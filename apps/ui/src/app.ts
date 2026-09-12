import "./styles.css";
import {
  buildTree,
  childrenOf,
  DEFAULT_SPEC_PATH,
  DEFAULT_TREE_CONFIG,
  GitHubClient,
  HttpError,
  isRateLimited,
  isTokenRejected,
  LOCALE_KEY,
  normalizeTreeConfig,
  parseRepoConfig,
  REPO_CONFIG_PATH,
  parentOf,
  parseRepo,
  seasonOf,
  STATUSES,
  t,
  type GitHubUser,
  type Host,
  type ResearchTree,
  type VersionNode,
  type Status,
  type RepoConfig,
  type RepoConfigWarning,
  type MessageKey,
  type TreeConfig,
} from "@researchtree/core";
import { followColorScheme } from "./colorscheme";
import { paintSystemBars } from "./systembars";
import { append, clear, h, icon } from "./dom";
import { Panel } from "./panel/panel";
import { applyLocale, localePreference } from "./locale";
import { loadingScreen, loginScreen, messageScreen, repoPicker, settingsDialog } from "./screens";
import { mergeConfig, parseSettings, SETTING_PARAMS, settingParams, type UrlSettings } from "./settings-url";
import { statusLabel } from "./theme";
import { islandIds, islandMetricKeys, rootVersion, seasonLabel } from "./views/layout";
import { Tree3D, type Heading } from "./views/tree3d";
import type { ViewOptions } from "./views/view";

const RECENT_KEY = "recentRepos";
const LAST_KEY = "lastRepo";
const metricsKey = (repo: string) => `islandMetrics:${repo}`;
const MODE_KEY = "viewMode";
const BRAND_KEY = "brandCollapsed";
const configKey = (repo: string) => `config:${repo}`;
const GUIDE_URL = "https://darkpyonix.github.io/researchtree/guide/";
const PROJECT_URL = "https://github.com/DarkPyonix/researchtree";

/**
 * The view button cycles island -> flat -> tree -> tree3d -> island. "island" is the first view;
 * "flat" presses it flat; "tree" turns the flat view so versions rise from bottom to top; "tree3d"
 * raises the islands again at that angle.
 */
type ViewMode = "island" | "flat" | "tree" | "tree3d";
const NEXT_MODE: Record<ViewMode, ViewMode> = { island: "flat", flat: "tree", tree: "tree3d", tree3d: "island" };
/** Label of the button in each mode: what pressing it does. */
const MODE_ACTION: Record<ViewMode, MessageKey> = { island: "toolbar.flat", flat: "toolbar.tree", tree: "toolbar.raise", tree3d: "toolbar.island" };
const isFlatMode = (mode: ViewMode) => mode === "flat" || mode === "tree";
const headingOf = (mode: ViewMode): Heading => (mode === "tree" || mode === "tree3d" ? "tree" : "island");

function savedMode(value: unknown): ViewMode {
  if (value === "2d") return "flat"; // saved by earlier versions
  return value === "flat" || value === "tree" || value === "tree3d" ? value : "island";
}

const hint = (mode: ViewMode) => t(isFlatMode(mode) ? "hint.2d" : "hint.3d");

/** Start the viewer on the given host (web / extension / local). */
export async function startApp(host: Host, root: HTMLElement): Promise<void> {
  document.body.classList.add(`host-${host.kind}`);
  // A link may carry settings (`?lang=en&root=…`); the language has to be in place before any screen.
  const urlSettings = parseSettings(location.search);
  if (urlSettings.locale) host.storage.set(LOCALE_KEY, urlSettings.locale);
  applyLocale(host);
  followColorScheme();
  await new App(host, root, urlSettings).boot();
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
  private view: Tree3D | null = null;
  private mode: ViewMode;
  private config: TreeConfig = DEFAULT_TREE_CONFIG;
  /** `.researchtree.yml` on the root branch of the open repo (shared by the team; empty when absent). */
  private repoFile: { config: RepoConfig; warnings: RepoConfigWarning[] } = { config: {}, warnings: [] };
  private stage: { canvas: HTMLElement; hint: HTMLElement; options: ViewOptions } | null = null;
  private panel: Panel | null = null;
  private selected: string | null = null;
  private hidden = new Set<Status>();
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
    /** Settings asked for by the link that opened the viewer; used once, for the repo it opens. */
    private urlSettings: UrlSettings = { ignored: [] },
  ) {
    this.gh = new GitHubClient(host);
    this.mode = savedMode(host.storage.get<string>(MODE_KEY));
  }

  private mount(el: HTMLElement): void {
    if (this.keyHandler) document.removeEventListener("keydown", this.keyHandler);
    this.keyHandler = null;
    this.view?.destroy();
    this.view = null;
    this.stage = null;
    this.panel = null;
    this.shell = null;
    clear(this.root);
    this.root.append(el);
    paintSystemBars(false); // full-page screens sit on the page background
  }

  async boot(loginError?: string): Promise<void> {
    this.mount(loadingScreen(t("app.loading")));
    try {
      this.user = await this.host.auth.current();
    } catch (e) {
      this.mount(
        messageScreen({
          title: t("app.connectFailedTitle"),
          body: [errorText(e), t("app.connectFailedBody")],
          actions: [{ label: t("common.retry"), primary: true, onClick: () => void this.boot() }],
        }),
      );
      return;
    }
    const repo = urlParam("repo") ?? (await this.host.initialRepo()) ?? this.host.storage.get<string>(LAST_KEY) ?? null;
    // Guest mode: a link to a public repo opens read-only, without a sign-in first. GitHub allows
    // 60 anonymous calls an hour per address, so the sign-in screen is still one click away.
    if (!this.user) {
      if (loginError || !repo) return this.showLogin(loginError);
      return this.openRepo(repo);
    }
    if (!repo) return this.showPicker();
    await this.openRepo(repo);
  }

  private showLogin(error?: string): void {
    this.mount(loginScreen({ host: this.host, error, onSignedIn: () => void this.boot() }));
  }

  private showPicker(error?: string): void {
    if (!this.user) return this.showLogin(error);
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
    if (isTokenRejected(e)) {
      void this.host.auth.signOut().then(() => this.showLogin(t("app.sessionExpired")));
      return;
    }
    if (!this.user && isRateLimited(e)) {
      this.showLogin(t("guest.rateLimited"));
      return;
    }
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) {
      if (!this.user) return this.showLogin(t("guest.needsSignIn", { repo }));
      this.showPicker(t("app.repoNotFound", { repo }));
      return;
    }
    this.mount(
      messageScreen({
        title: t("app.treeFailedTitle"),
        body: [errorText(e)],
        actions: [
          { label: t("common.retry"), primary: true, onClick: () => void this.openRepo(repo) },
          { label: t("common.otherRepo"), onClick: () => this.showPicker() },
        ],
      }),
    );
  }

  private async openRepo(repo: string): Promise<void> {
    if (!parseRepo(repo)) return this.showPicker(t("app.invalidRepo"));
    this.mount(loadingScreen(t("app.loadingRepo", { repo })));
    this.applyUrlSettings(repo);
    this.config = this.repoConfig(repo);
    const { root, prefix } = this.config;
    try {
      if (!(await this.gh.branchExists(repo, root))) {
        this.mount(
          messageScreen({
            eyebrow: repo,
            title: t("app.noRootTitle", { root }),
            body: [
              t("app.noRootBody", { root }),
              h("pre", { class: "code" }, `git switch -c ${root}\ngit push -u origin ${root}`),
              t("app.noRootNext", { prefix }),
            ],
            actions: [
              { label: t("app.recheck"), primary: true, onClick: () => void this.openRepo(repo) },
              { label: t("settings.branchTitle"), onClick: () => this.openSettings(repo) },
              { label: t("common.otherRepo"), onClick: () => this.showPicker() },
            ],
          }),
        );
        return;
      }
      this.repoFile = await this.readRepoFile(repo, root);
      // The team's file wins over this browser's saved prefix.
      if (this.repoFile.config.prefix) this.config = { root, prefix: this.repoFile.config.prefix };
      this.tree = await this.loadTree(repo);
    } catch (e) {
      this.handleError(e, repo);
      return;
    }

    this.host.storage.set(LAST_KEY, repo);
    const recent = [repo, ...(this.host.storage.get<string[]>(RECENT_KEY) ?? []).filter((r) => r !== repo)].slice(0, 6);
    this.host.storage.set(RECENT_KEY, recent);

    this.renderMain();
    const want = urlParam("node");
    const known = want && (this.tree.nodes.has(want) || this.tree.versions.has(want) || want === this.tree.root);
    this.select(known ? want : null, false);
    this.setUrl({ repo, node: this.selected });
  }

  /** PRs plus research version tags. A repo without tags (or a failed tag lookup) still gets a tree. */
  private async loadTree(repo: string): Promise<ResearchTree> {
    const [prs, tags, activity] = await Promise.all([
      this.gh.listPulls(repo),
      this.gh.listVersionTags(repo, this.config.root).catch(() => []),
      // Commit dates place experiments on the time axis; without them PR dates are used. They come
      // from the GraphQL API, which turns away anonymous callers, so a guest never has them.
      this.user ? this.gh.listPullActivity(repo).catch(() => new Map()) : Promise.resolve(new Map()),
    ]);
    return buildTree(prs, repo, this.config, tags, activity);
  }

  /** `.researchtree.yml` from the root branch. A missing or unreadable file means the defaults. */
  private async readRepoFile(repo: string, root: string): Promise<{ config: RepoConfig; warnings: RepoConfigWarning[] }> {
    const text = await this.gh.getFileText(repo, REPO_CONFIG_PATH, root).catch(() => null);
    return text === null ? { config: {}, warnings: [] } : parseRepoConfig(text);
  }

  /** Branch settings from the link that opened the viewer, saved for this repo. Applies once. */
  private applyUrlSettings(repo: string): void {
    const wanted = this.urlSettings.config;
    this.urlSettings = { ignored: this.urlSettings.ignored };
    const config = mergeConfig(this.repoConfig(repo), wanted);
    if (config) this.host.storage.set(configKey(repo), config);
  }

  /** Branch names for a repo: saved settings, or the defaults (research / experiment/). */
  private repoConfig(repo: string): TreeConfig {
    const saved = this.host.storage.get<Partial<TreeConfig>>(configKey(repo));
    const c = saved ? normalizeTreeConfig(saved) : DEFAULT_TREE_CONFIG;
    return "error" in c ? DEFAULT_TREE_CONFIG : c;
  }

  /** What the repo's `.researchtree.yml` decides, shown in the settings dialog. */
  private repoFileNotes(repo: string): string[] {
    if (this.tree?.repo !== repo) return [];
    const notes: string[] = [];
    const { config, warnings } = this.repoFile;
    if (config.prefix) notes.push(t("config.repoFile", { prefix: config.prefix }));
    if (warnings.length) notes.push(t("config.repoWarnings", { items: warnings.map((w) => ("key" in w ? `${w.key} (${w.code})` : w.code)).join(", ") }));
    return notes;
  }

  private openSettings(repo: string): void {
    const dialog = settingsDialog({
      repo,
      config: this.repoConfig(repo),
      notes: this.repoFileNotes(repo),
      locale: localePreference(this.host),
      autoSource: t(this.host.kind === "extension" ? "settings.sourceVscode" : "settings.sourceBrowser"),
      onSave: ({ config, locale }) => {
        this.host.storage.set(configKey(repo), config);
        this.host.storage.set(LOCALE_KEY, locale);
        this.setUrl({ repo, node: this.selected });
        // Reloading the repo re-renders every screen in the new language.
        applyLocale(this.host);
        dialog.remove();
        void this.openRepo(repo);
      },
      onCancel: () => dialog.remove(),
    });
    document.body.append(dialog);
    dialog.querySelector("input")?.focus();
  }

  private async refresh(message = t("app.refreshed")): Promise<void> {
    if (!this.tree) return;
    const repo = this.tree.repo;
    this.gh.invalidate();
    try {
      this.tree = await this.loadTree(repo);
    } catch (e) {
      this.toast(t("app.refreshFailed", { error: errorText(e) }));
      return;
    }
    this.renderBrand();
    this.renderGenerations();
    this.view!.render(this.tree, this.filter());
    const sel = this.selected && this.tree.nodes.has(this.selected) ? this.selected : null;
    this.select(sel, false);
    this.toast(message);
  }

  private filter() {
    return { hidden: this.hidden, metrics: this.islandMetrics() };
  }

  /** Label metric per island: the saved pick if still recorded there, else the island's most used metric. */
  private islandMetrics(): Map<string, string | null> {
    const tree = this.tree!;
    const saved = this.host.storage.get<Record<string, string>>(metricsKey(tree.repo)) ?? {};
    return new Map(
      islandIds(tree).map((island) => {
        const keys = islandMetricKeys(tree, island);
        const want = saved[island];
        return [island, want === "" ? null : want && keys.includes(want) ? want : (keys[0] ?? null)];
      }),
    );
  }

  private setIslandMetric(island: string, metric: string | null): void {
    const tree = this.tree!;
    const saved = this.host.storage.get<Record<string, string>>(metricsKey(tree.repo)) ?? {};
    this.host.storage.set(metricsKey(tree.repo), { ...saved, [island]: metric ?? "" });
    this.view?.render(tree, this.filter());
    this.view?.select(this.selected, false);
  }

  private renderMain(): void {
    const canvas = h("div", { class: "canvas" });
    const brand = h("section", { class: "card brand", "aria-label": t("app.repoInfo") });
    const time = h("div", { class: "brand-time", "aria-live": "polite" });
    const brandStack = h("div", { class: "brand-stack" }, brand, time);
    const panelEl = h("aside", { class: "card panel", "aria-label": t("app.detail") });
    const gens = h("nav", { class: "card gens", "aria-label": t("gens.nav") });
    const toast = h("div", { class: "toast", role: "status", "aria-live": "polite" });
    const toolbar = this.renderToolbar();
    const hint = h("div", { class: "hint" });

    this.mount(h("div", { class: "shell" }, canvas, brandStack, toolbar, panelEl, gens, hint, toast));
    this.shell = { brand, gens, toast };

    this.panel = new Panel(panelEl, {
      host: this.host,
      gh: this.gh,
      onNavigate: (id) => this.select(id),
      onUpdated: (message) => this.refresh(message),
      signedIn: () => this.user !== null,
      islandMetric: (island) => ({ keys: islandMetricKeys(this.tree!, island), current: this.islandMetrics().get(island) ?? null }),
      onIslandMetric: (island, metric) => this.setIslandMetric(island, metric),
      specPath: () => this.repoFile.config.spec ?? DEFAULT_SPEC_PATH,
    });
    this.stage = {
      canvas,
      hint,
      options: {
        onSelect: (id) => this.select(id),
        insets: () => {
          const panel = this.panel?.covered ?? { right: 0, bottom: 0 };
          // On narrow screens the brand card spans the full width, so keep the tree below it.
          const b = brandStack.getBoundingClientRect();
          const top = b.width > window.innerWidth * 0.6 ? b.bottom + 8 : 16;
          return { top, left: 16, right: panel.right, bottom: Math.max(88, panel.bottom) };
        },
        onTime: (ms) => {
          clear(time);
          if (ms === null) return;
          const d = new Date(ms);
          append(time, [h("span", { class: "brand-year" }, String(d.getFullYear())), h("span", { class: "brand-season" }, seasonLabel(seasonOf(d.toISOString())))]);
        },
      },
    };

    this.renderBrand();
    this.renderGenerations();
    this.createView();

    this.keyHandler = (e) => this.onKey(e);
    document.addEventListener("keydown", this.keyHandler);
  }

  private renderToolbar(): HTMLElement {
    const btn = (label: string, iconName: Parameters<typeof icon>[0], onClick: () => void, title?: string) =>
      h("button", { class: "btn", onclick: onClick, title: title ?? label, "aria-label": title ?? label }, icon(iconName, 15), h("span", { class: "btn-label" }, label));

    if (!this.user) {
      return h(
        "div",
        { class: "toolbar" },
        btn(t("toolbar.refresh"), "refresh", () => void this.refresh()),
        this.modeButton(),
        btn(t("toolbar.settings"), "gear", () => this.tree && this.openSettings(this.tree.repo)),
        h(
          "button",
          { class: "btn primary", onclick: () => this.showLogin(), title: t("guest.signInTitle") },
          icon("github", 15),
          h("span", { class: "btn-label" }, t("login.withGitHub")),
        ),
      );
    }

    // Opens on hover (and keyboard focus); a click toggles it for touch screens.
    const userEl = h(
      "div",
      { class: "user-menu" },
      h(
        "button",
        { class: "btn", "aria-label": t("app.account"), "aria-haspopup": "menu", onclick: () => userEl.classList.toggle("open") },
        this.user?.avatar_url ? h("img", { class: "avatar", src: this.user.avatar_url, alt: "" }) : null,
        h("span", { class: "btn-label" }, `@${this.user?.login ?? ""}`),
      ),
      h(
        "div",
        { class: "card menu" },
        this.tree
          ? h("button", { class: "menu-item", onclick: () => this.host.openExternal(`https://github.com/${this.tree!.repo}`) }, icon("github", 14), ` ${t("menu.openRepoOnGitHub")}`)
          : null,
        h("button", { class: "menu-item", onclick: () => this.showPicker() }, icon("repo", 14), ` ${t("menu.openOtherRepo")}`),
        h("hr", { class: "menu-sep" }),
        h("button", { class: "menu-item", onclick: () => this.host.openExternal(GUIDE_URL) }, icon("external", 14), ` ${t("menu.guide")}`),
        h("button", { class: "menu-item", onclick: () => this.host.openExternal(PROJECT_URL) }, icon("github", 14), ` ${t("menu.project")}`),
        h("hr", { class: "menu-sep" }),
        h("button", { class: "menu-item", onclick: () => void this.signOut() }, icon("logout", 14), ` ${t("common.signOut")}`),
      ),
    );

    return h(
      "div",
      { class: "toolbar" },
      btn(t("toolbar.refresh"), "refresh", () => void this.refresh()),
      this.modeButton(),
      btn(t("toolbar.settings"), "gear", () => this.tree && this.openSettings(this.tree.repo)),
      btn(t("toolbar.fit"), "fit", () => {
        this.activeDepth = null;
        this.renderGenerations();
        this.view?.fit();
      }),
      userEl,
    );
  }

  /** (Re)create the tree view for the current mode on the existing stage. */
  private createView(): void {
    const stage = this.stage;
    if (!stage || !this.tree) return;
    this.view?.destroy();
    this.view = null;
    if (!Tree3D.supported()) {
      stage.hint.textContent = t("app.noWebGL");
      return;
    }
    stage.canvas.classList.toggle("is-3d", !isFlatMode(this.mode));
    stage.hint.textContent = hint(this.mode);
    this.view = new Tree3D(stage.canvas, stage.options, isFlatMode(this.mode), headingOf(this.mode));
    paintSystemBars(!isFlatMode(this.mode));
    this.view.render(this.tree, this.filter());
    this.view.select(this.selected, false);
  }

  private modeButton(): HTMLElement {
    const label = () => t(MODE_ACTION[this.mode]);
    const text = h("span", { class: "btn-label" }, label());
    const button = h(
      "button",
      {
        class: "btn",
        title: t("toolbar.switchMode"),
        "aria-label": t("toolbar.switchMode"),
        disabled: !Tree3D.supported(),
        onclick: async () => {
          button.disabled = true;
          try {
            await this.switchMode();
          } catch (e) {
            this.toast(t("app.switchFailed", { error: errorText(e) }));
          } finally {
            text.textContent = label();
            button.disabled = false;
          }
        },
      },
      icon("cube", 15),
      text,
    );
    return button;
  }

  /**
   * Go to the next view. All four are the same scene: the islands are pressed flat under a top-down
   * camera (the ground disappears) or raised again, and the camera turns between the two headings.
   */
  private async switchMode(): Promise<void> {
    const stage = this.stage;
    const view = this.view;
    if (!stage || !view) return;
    const next = NEXT_MODE[this.mode];
    this.mode = next;
    this.host.storage.set(MODE_KEY, next);
    stage.hint.textContent = hint(next);
    if (next === "flat") {
      await view.lower();
      stage.canvas.classList.remove("is-3d");
      paintSystemBars(false);
    } else if (next === "tree") {
      await view.turn("tree");
    } else if (next === "tree3d") {
      stage.canvas.classList.add("is-3d");
      paintSystemBars(true);
      await view.raise();
    } else {
      await view.turn("island");
    }
  }

  private renderBrand(): void {
    const brand = this.shell!.brand;
    const tree = this.tree!;
    clear(brand);
    const [, name] = tree.repo.split("/");
    const nodes = [...tree.nodes.values()];
    const count = (s: Status) => nodes.filter((n) => n.status === s).length;
    const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));

    const layers = h(
      "div",
      { class: "layers", role: "group", "aria-label": t("brand.layers") },
      STATUSES.map((s) =>
        h(
          "button",
          {
            class: `chip layer status-${s}`,
            "aria-pressed": String(!this.hidden.has(s)),
            title: t(this.hidden.has(s) ? "brand.showStatus" : "brand.dimStatus", { status: statusLabel(s) }),
            onclick: () => {
              if (this.hidden.has(s)) this.hidden.delete(s);
              else this.hidden.add(s);
              this.renderBrand();
              this.view?.render(this.tree!, this.filter());
              this.view?.select(this.selected, false);
            },
          },
          h("span", { class: "chip-dot" }),
          statusLabel(s),
          h("span", { class: "chip-count" }, count(s)),
        ),
      ),
    );

    // Open by default; collapsed it keeps only the count and the repo name (remembered).
    const collapsed = Boolean(this.host.storage.get<boolean>(BRAND_KEY));
    brand.classList.toggle("collapsed", collapsed);
    const toggle = h(
      "button",
      {
        class: "icon-btn brand-toggle",
        "aria-expanded": String(!collapsed),
        "aria-label": t(collapsed ? "brand.expand" : "brand.collapse"),
        title: t(collapsed ? "brand.expand" : "brand.collapse"),
        onclick: () => {
          this.host.storage.set(BRAND_KEY, !collapsed || undefined);
          this.renderBrand();
        },
      },
      icon("down", 14),
    );
    append(brand, [
      toggle,
      h("div", { class: "eyebrow" }, "Research Tree · DarkPyonix.dev"),
      h("div", { class: "brand-title" }, h("span", { class: "count" }, String(nodes.length).padStart(2, "0")), h("h1", null, name)),
      h(
        "p",
        { class: "brand-sub" },
        nodes.length
          ? tree.versions.size
            ? t("brand.subVersions", { root: tree.root, count: tree.versions.size + 1, depth: maxDepth })
            : t("brand.subBranches", { root: tree.root, count: tree.rootChildren.length, depth: maxDepth })
          : t("brand.empty", { prefix: tree.prefix, root: tree.root }),
      ),
      layers,
      this.user ? null : h("p", { class: "muted small guest-note" }, t("guest.note")),
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
      else this.view?.fit([...tree.nodes.values()].filter((n) => n.depth === d).map((n) => n.id), true);
    };
    const cur = this.activeDepth;
    // Generations that don't fit scroll sideways (wheel or arrows); the active one is kept centered.
    const chips = Array.from({ length: maxDepth }, (_, i) => i + 1).map((d) =>
      h("button", { class: `gen-btn${cur === d ? " active" : ""}`, "aria-pressed": String(cur === d), onclick: () => go(d) }, String(d).padStart(2, "0")),
    );
    const track = h("div", { class: "gens-track" }, ...chips);
    track.addEventListener(
      "wheel",
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        track.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    gens.append(
      h("span", { class: "gens-label" }, t("gens.label")),
      h("button", { class: "icon-btn", "aria-label": t("gens.prev"), disabled: cur === null || cur <= 1, onclick: () => go(Math.max(1, (cur ?? 1) - 1)) }, icon("left")),
      track,
      h("button", { class: "icon-btn", "aria-label": t("gens.next"), disabled: cur === maxDepth, onclick: () => go(Math.min(maxDepth, (cur ?? 0) + 1)) }, icon("right")),
      h("span", { class: "gens-count" }, cur === null ? t("gens.all", { n: maxDepth }) : `${cur} / ${maxDepth}`),
    );
    const active = cur === null ? undefined : chips[cur - 1];
    if (active) requestAnimationFrame(() => (track.scrollLeft = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2));
  }

  private select(id: string | null, focus = true): void {
    const tree = this.tree;
    if (!tree || !this.view || !this.panel) return;
    const node = id ? tree.nodes.get(id) : undefined;
    const version = id ? tree.versions.get(id) : undefined;
    const isRoot = id === tree.root;
    this.selected = node?.id ?? version?.id ?? (isRoot ? tree.root : null);
    if (node) this.panel.show(node, tree);
    else if (version) this.panel.showVersion(version, tree);
    else if (isRoot) this.panel.showVersion(rootVersion(tree), tree);
    else this.panel.hide();
    this.shell?.brand.closest(".shell")?.classList.toggle("panel-open", Boolean(this.selected));
    this.view.select(this.selected, focus);
    this.setUrl({ repo: tree.repo, node: this.selected });
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey)) return;
    const tree = this.tree;
    if (!tree) return;
    const cur = this.selected;
    const parent = cur ? parentOf(tree, cur) : undefined;
    const siblings = parent ? childrenOf(tree, parent) : tree.rootChildren;
    let next: string | null | undefined;

    switch (e.key) {
      case "Escape":
        next = null;
        break;
      case "ArrowRight":
        next = cur ? childrenOf(tree, cur)[0] : tree.rootChildren[0];
        break;
      case "ArrowLeft":
        next = cur && parent && parent !== tree.root ? parent : undefined;
        break;
      case "ArrowDown":
      case "ArrowUp": {
        if (!cur) {
          next = tree.rootChildren[0];
          break;
        }
        const i = siblings.indexOf(cur) + (e.key === "ArrowDown" ? 1 : -1);
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
      for (const k of ["code", "state", ...SETTING_PARAMS]) params.delete(k);
      if (p.repo) params.set("repo", p.repo);
      else params.delete("repo");
      if (p.node) params.set("node", p.node);
      else params.delete("node");
      // Settings come after repo and node, so the link reads "what to open" first, "how to show it" after.
      if (p.repo) {
        const settings = settingParams({ locale: localePreference(this.host), config: this.repoConfig(p.repo), defaults: DEFAULT_TREE_CONFIG });
        for (const [key, value] of Object.entries(settings)) if (value) params.set(key, value);
      }
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
