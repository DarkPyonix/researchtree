import "./styles.css";
import "./gallery.css";
import { buildTree, DEFAULT_TREE_CONFIG, detectLocale, t, type PullRequest, type Season, type Status } from "@researchtree/core";
import { environmentLanguages, useLocale } from "./locale";
import { islandIds, islandMetricKeys, seasonLabel } from "./views/layout";
import { Tree3D } from "./views/tree3d";
import type { TreeViewApi, ViewFilter, ViewOptions } from "./views/view";

/*
 * Season gallery embedded in the guide (docs/guide/viewer/seasons.md; `npm run build:gallery`).
 * No network and no sign-in: the real 3D and 2D views render a synthetic one-year tree with one
 * experiment per state (adopted, running, rejected, draft) in every season, side by side.
 */

const SEASONS: { season: Season; month: number; year: number }[] = [
  { season: "spring", month: 3, year: 2025 },
  { season: "summer", month: 6, year: 2025 },
  { season: "autumn", month: 9, year: 2025 },
  { season: "winter", month: 12, year: 2025 },
];
const STATES: { key: string; status: Status | "draft" }[] = [
  { key: "adopted", status: "adopted" },
  { key: "running", status: "running" },
  { key: "rejected", status: "rejected" },
  { key: "draft", status: "draft" },
];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 9)).toISOString();

function galleryPulls(): PullRequest[] {
  const prs: PullRequest[] = [];
  let n = 1;
  for (const { season, month, year } of SEASONS) {
    const adopted = `experiment/${season}-adopted`;
    STATES.forEach(({ key, status }, i) => {
      const branch = `experiment/${season}-${key}`;
      const started = iso(year, month, 4 + i * 16);
      const ended = iso(year, month, 12 + i * 16);
      const closed = status === "adopted" || status === "rejected";
      const parent = key === "adopted" ? "research" : adopted;
      prs.push({
        number: n,
        html_url: `https://github.com/example/seasons/pull/${n++}`,
        title: `${seasonLabel(season)} · ${key}`,
        state: closed ? "closed" : "open",
        draft: status === "draft",
        merged_at: status === "adopted" ? ended : null,
        created_at: started,
        updated_at: ended,
        closed_at: closed ? ended : null,
        user: { login: "gallery", avatar_url: "" },
        head: { ref: branch, sha: `${season}${i}` },
        base: { ref: key === "adopted" ? "research" : adopted },
        body: `\`\`\`yaml\nparent: ${parent}\nhypothesis: ${t("gallery.hypothesis", { season: seasonLabel(season), state: key })}\nstarted: ${started}\nended: ${ended}\nmetrics:\n  val_loss: ${(2.9 - n * 0.03).toFixed(2)}\n\`\`\`\n`,
      } as PullRequest);
    });
  }
  return prs;
}

function main(): void {
  // No host here: follow the page language (`?lang=ko|en`, e.g. from the guide) or the browser.
  const lang = new URLSearchParams(location.search).get("lang");
  useLocale(lang === "ko" || lang === "en" ? lang : detectLocale(environmentLanguages()));
  document.title = `ResearchTree · ${t("gallery.title")}`;
  const tree = buildTree(galleryPulls(), "example/seasons", DEFAULT_TREE_CONFIG);
  const filter: ViewFilter = { hidden: new Set(), metrics: new Map(islandIds(tree).map((i) => [i, islandMetricKeys(tree, i)[0] ?? null])) };
  const root = document.getElementById("app")!;
  root.className = "gallery";

  const header = document.createElement("header");
  header.className = "gallery-head";
  const title = document.createElement("h1");
  title.textContent = t("gallery.title");
  const sub = document.createElement("p");
  sub.textContent = t("gallery.sub");
  const legend = document.createElement("div");
  legend.className = "gallery-legend";
  for (const { season } of SEASONS) {
    const chip = document.createElement("span");
    chip.className = `gallery-chip season-chip-${season}`;
    chip.textContent = seasonLabel(season);
    legend.append(chip);
  }
  header.append(title, sub, legend);
  root.append(header);

  const section = (text: string) => {
    const h = document.createElement("h2");
    h.className = "gallery-section";
    h.textContent = text;
    root.append(h);
  };
  const panel = (
    parent: HTMLElement,
    label: string,
    make: (el: HTMLElement, opts: ViewOptions) => TreeViewApi,
    focus?: string[],
    cls = "",
  ) => {
    const box = document.createElement("section");
    box.className = `gallery-panel ${cls}`;
    const cap = document.createElement("div");
    cap.className = "gallery-cap";
    cap.textContent = label;
    const canvas = document.createElement("div");
    canvas.className = make === flat ? "canvas" : "canvas is-3d";
    box.append(canvas, cap);
    parent.append(box);
    let view: TreeViewApi;
    const opts: ViewOptions = { onSelect: (id) => view.select(id, false), insets: () => ({ top: 36, right: 12, bottom: 12, left: 12 }) };
    view = make(canvas, opts);
    view.render(tree, filter);
    requestAnimationFrame(() => view.fit(focus, false));
  };

  const island = (el: HTMLElement, opts: ViewOptions) => new Tree3D(el, opts);
  const flat = (el: HTMLElement, opts: ViewOptions) => new Tree3D(el, opts, true);
  if (Tree3D.supported()) {
    section(t("gallery.closeUp"));
    const grid = document.createElement("div");
    grid.className = "gallery-grid";
    root.append(grid);
    for (const { season } of SEASONS) {
      const ids = STATES.map(({ key }) => `experiment/${season}-${key}`);
      panel(grid, t("gallery.caption", { season: seasonLabel(season) }), island, ids, "close");
    }
    section(t("gallery.yearIsland"));
    panel(root, t("gallery.island"), island);
    section(t("gallery.yearFlat"));
    panel(root, t("toolbar.flat"), flat);
  }
}

main();
