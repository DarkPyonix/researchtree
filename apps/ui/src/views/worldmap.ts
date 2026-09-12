/**
 * The map of an account's research (docs/ISLAND.md).
 *
 * It is a travel tool, not the world: the islands themselves are always out there on the sea behind
 * it, and this only says where they are and sails you to one. It opens on arrival, the way a game
 * shows you the world map when you first walk in, and the toolbar reopens it at any time.
 *
 * Each land on the map is a group of research (an "island" in the settings file); each research is a
 * place on that land. What the reader cannot open is drawn as an area that is not unlocked yet.
 */
import { islandResearch, t, type IslandMap } from "@researchtree/core";
import { h, icon } from "../dom";

export interface WorldMapOptions {
  map: IslandMap;
  /** Whose map it is, for the heading. */
  user: string;
  /** Research this reader cannot open, drawn locked. */
  locked: ReadonlySet<string>;
  /** The research the camera is looking at, if any. */
  here: string | null;
  /** Sail the camera to one research and close the map. */
  onSail(repo: string): void;
  /** Open a research: leave the map behind and walk into the tree. */
  onOpen(repo: string): void;
}

/** Where each land sits on the map, laid out from the grid the settings file gives. */
function bounds(map: IslandMap): { minX: number; minY: number; cols: number; rows: number } {
  const xs = map.islands.map((i) => i.at[0]);
  const ys = map.islands.map((i) => i.at[1]);
  const minX = Math.min(0, ...xs);
  const minY = Math.min(0, ...ys);
  return { minX, minY, cols: Math.max(...xs, 0) - minX + 1, rows: Math.max(...ys, 0) - minY + 1 };
}

export function worldMapDialog(opts: WorldMapOptions): HTMLElement {
  const { map } = opts;
  const grid = bounds(map);
  const overlay = h("div", { class: "overlay map-overlay" });
  const close = () => overlay.remove();

  const board = h("div", { class: "map-board" });
  board.style.gridTemplateColumns = `repeat(${grid.cols}, minmax(0, 1fr))`;

  for (const land of map.islands) {
    const places = land.repos.map((entry) => {
      const locked = opts.locked.has(entry.repo);
      const name = entry.repo.split("/")[1] ?? entry.repo;
      const here = opts.here === entry.repo;
      const place = h(
        "button",
        {
          class: `map-place${locked ? " locked" : ""}${here ? " here" : ""}`,
          type: "button",
          title: locked ? t("world.lockedSub") : entry.repo,
          onclick: () => {
            close();
            opts.onSail(entry.repo);
          },
          ondblclick: () => {
            close();
            opts.onOpen(entry.repo);
          },
        },
        h("span", { class: "map-pin" }, locked ? icon("warn", 11) : icon("island", 11)),
        h("span", { class: "map-place-name" }, locked ? t("world.lockedName") : name),
      );
      return place;
    });
    const cell = h(
      "section",
      { class: "map-land", "aria-label": land.name },
      h("h3", { class: "map-land-name" }, land.name),
      h("div", { class: "map-places" }, places.length ? places : h("p", { class: "muted small" }, t("world.empty"))),
    );
    cell.style.gridColumn = String(land.at[0] - grid.minX + 1);
    cell.style.gridRow = String(land.at[1] - grid.minY + 1);
    board.append(cell);
  }

  const count = islandResearch(map).length;
  const dialog = h(
    "div",
    { class: "card dialog map-dialog", role: "dialog", "aria-modal": "true", "aria-label": t("world.mapTitle") },
    h(
      "div",
      { class: "map-head" },
      h(
        "div",
        null,
        h("div", { class: "eyebrow" }, t("world.land")),
        h("h2", { class: "map-title" }, t("world.title", { user: opts.user })),
      ),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("common.close"), onclick: close }, icon("close", 16)),
    ),
    board,
    h("p", { class: "map-hint muted small" }, t("world.mapHint", { count: String(count) })),
  );

  overlay.append(dialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  // The map takes the keyboard when it opens, so Escape reaches it and Tab walks the places.
  requestAnimationFrame(() => overlay.querySelector<HTMLElement>(".map-place")?.focus({ preventScroll: true }));
  return overlay;
}
