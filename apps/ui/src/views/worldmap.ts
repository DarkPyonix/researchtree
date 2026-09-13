/**
 * The map of an account's research (docs/ISLAND.md).
 *
 * It is a travel tool, not the world: the islands themselves are always out there on the sea behind
 * it, and this only says where they are and sails you to one. It opens on arrival, the way a game
 * shows you the world map when you first walk in, and the toolbar reopens it at any time.
 *
 * Drawn as a chart rather than a list: each land in the settings file becomes an island whose shape
 * is its own (seeded by its name), each research a place on that land. What the reader cannot open
 * is an area that is not unlocked yet.
 */
import { islandResearch, t, type IslandLand, type IslandMap } from "@researchtree/core";
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

const SVG = "http://www.w3.org/2000/svg";
const VIEW_W = 900;
const VIEW_H = 560;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** A repeatable number from a name, so a land keeps the same shape every time the map opens. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** An island outline: a closed curve wobbling around a circle, never the same twice. */
function blob(cx: number, cy: number, rx: number, ry: number, seed: string): string {
  const rand = seeded(seed);
  const steps = 11;
  const points: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = 0.74 + rand() * 0.42;
    points.push([cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble]);
  }
  // Through the points with a smooth closed spline: the midpoints are anchors, the points handles.
  const at = (i: number): [number, number] => points[((i % steps) + steps) % steps]!;
  const mid = (i: number): [number, number] => {
    const [x, y] = at(i);
    const [nx, ny] = at(i + 1);
    return [(x + nx) / 2, (y + ny) / 2];
  };
  const start = mid(0);
  let d = `M${start[0].toFixed(1)},${start[1].toFixed(1)}`;
  for (let i = 0; i < steps; i++) {
    const [hx, hy] = at(i + 1);
    const [ex, ey] = mid(i + 1);
    d += `Q${hx.toFixed(1)},${hy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Where each land sits, from the grid the settings file gives. */
function places(map: IslandMap): { land: IslandLand; cx: number; cy: number; rx: number; ry: number }[] {
  const xs = map.islands.map((i) => i.at[0]);
  const ys = map.islands.map((i) => i.at[1]);
  const minX = Math.min(0, ...xs);
  const minY = Math.min(0, ...ys);
  const cols = Math.max(...xs, 0) - minX + 1;
  const rows = Math.max(...ys, 0) - minY + 1;
  const cellW = VIEW_W / cols;
  const cellH = VIEW_H / rows;
  return map.islands.map((land) => {
    // Bigger lands for more research, but never so big that two of them touch.
    const size = Math.min(1, 0.5 + land.repos.length * 0.16);
    return {
      land,
      cx: (land.at[0] - minX + 0.5) * cellW,
      cy: (land.at[1] - minY + 0.5) * cellH,
      rx: Math.min(cellW * 0.42, 210) * size,
      ry: Math.min(cellH * 0.42, 150) * size,
    };
  });
}

function compass(): SVGGElement {
  const g = el("g", { class: "map-compass", "aria-hidden": "true", transform: "translate(56 58)" });
  g.append(
    el("circle", { r: 26, class: "map-compass-ring" }),
    el("path", { d: "M0,-24 L6,-4 L0,0 L-6,-4 Z", class: "map-compass-n" }),
    el("path", { d: "M0,24 L6,4 L0,0 L-6,4 Z", class: "map-compass-s" }),
    el("path", { d: "M-24,0 L-4,6 L0,0 L-4,-6 Z", class: "map-compass-s" }),
    el("path", { d: "M24,0 L4,6 L0,0 L4,-6 Z", class: "map-compass-s" }),
  );
  const n = el("text", { x: 0, y: -32, class: "map-compass-label", "text-anchor": "middle" });
  n.textContent = "N";
  g.append(n);
  return g;
}

export function worldMapDialog(opts: WorldMapOptions): HTMLElement {
  const { map } = opts;
  const overlay = h("div", { class: "overlay map-overlay" });
  const close = () => overlay.remove();

  const svg = el("svg", { class: "map-chart", viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, role: "group", "aria-label": t("world.mapTitle") });
  svg.append(el("rect", { class: "map-sea", x: 0, y: 0, width: VIEW_W, height: VIEW_H, rx: 18 }));

  for (const { land, cx, cy, rx, ry } of places(map)) {
    const group = el("g", { class: "map-island" });
    group.append(
      el("path", { class: "map-shallows", d: blob(cx, cy + 4, rx + 16, ry + 13, `${land.name}-sea`) }),
      el("path", { class: "map-sand", d: blob(cx, cy, rx + 7, ry + 6, `${land.name}-sand`) }),
      el("path", { class: "map-grass", d: blob(cx, cy - 2, rx, ry, land.name) }),
    );
    const name = el("text", { class: "map-island-name", x: cx, y: cy - ry - 14, "text-anchor": "middle" });
    name.textContent = land.name;
    group.append(name);

    // The research on this land, laid out around its middle by the places the settings file gives.
    const cols = Math.max(1, ...land.repos.map((r) => r.at[0] + 1));
    const rows = Math.max(1, ...land.repos.map((r) => r.at[1] + 1));
    for (const entry of land.repos) {
      const locked = opts.locked.has(entry.repo);
      const here = opts.here === entry.repo;
      const px = cx + ((entry.at[0] + 0.5) / cols - 0.5) * rx * 1.25;
      const py = cy + ((entry.at[1] + 0.5) / rows - 0.5) * ry * 1.1;
      const pin = el("g", {
        class: `map-place${locked ? " locked" : ""}${here ? " here" : ""}`,
        role: "button",
        tabindex: "0",
        "aria-label": locked ? `${t("world.lockedName")} — ${entry.repo}` : entry.repo,
        transform: `translate(${px.toFixed(1)} ${py.toFixed(1)})`,
      });
      const sail = () => {
        close();
        opts.onSail(entry.repo);
      };
      pin.addEventListener("click", sail);
      pin.addEventListener("dblclick", () => {
        close();
        opts.onOpen(entry.repo);
      });
      pin.addEventListener("keydown", (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === "Enter" || key === " ") {
          e.preventDefault();
          sail();
        }
      });
      pin.append(el("circle", { class: "map-pin", r: 7 }), el("circle", { class: "map-pin-dot", r: 2.5 }));
      const label = el("text", { class: "map-place-name", x: 0, y: 22, "text-anchor": "middle" });
      label.textContent = locked ? t("world.lockedName") : (entry.repo.split("/")[1] ?? entry.repo);
      pin.append(label);
      group.append(pin);
    }
    svg.append(group);
  }
  svg.append(compass());

  const board = h("div", { class: "map-board" });
  board.append(svg);

  const count = islandResearch(map).length;
  const dialog = h(
    "div",
    { class: "card dialog map-dialog", role: "dialog", "aria-modal": "true", "aria-label": t("world.mapTitle") },
    h(
      "div",
      { class: "map-head" },
      h("div", null, h("div", { class: "eyebrow" }, t("world.land")), h("h2", { class: "map-title" }, t("world.title", { user: opts.user }))),
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
  requestAnimationFrame(() => overlay.querySelector<SVGGElement>(".map-place")?.focus({ preventScroll: true }));
  return overlay;
}
