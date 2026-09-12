/**
 * The world map: an open sea you drag across, with one island per research (docs/ISLAND.md).
 *
 * Two words, two things. A *land* is a project you reach through a portal; a *research island* is
 * one repository, and its own versions are the connected islands you see once you sail into it.
 *
 * It is drawn to match the viewer it leads into: the same sea and sand and grass as the 3D island,
 * the same chip under each island as the labels over its plants, and no boxes around anything.
 */
import { t, type IslandLand, type IslandMap, type IslandResearch } from "@researchtree/core";
import { clear, h, svg } from "../dom";

/** How far apart things sit, in pixels of sea. */
const ISLAND_STEP_X = 300;
const ISLAND_STEP_Y = 260;
const LAND_STEP = 1150;
const MINIMAP = 148;

export interface WorldOptions {
  /** Sail into one research: the viewer opens that repository. */
  onOpen(research: IslandResearch): void;
  /** Research this reader cannot open, drawn as an island still under fog. */
  locked?(repo: string): boolean;
}

interface Placed {
  research: IslandResearch;
  x: number;
  y: number;
}

interface Spot {
  land: IslandLand;
  x: number;
  y: number;
  islands: Placed[];
}

function place(map: IslandMap): Spot[] {
  return map.islands.map((land) => {
    const x = land.at[0] * LAND_STEP;
    const y = land.at[1] * LAND_STEP;
    return {
      land,
      x,
      y,
      islands: land.repos.map((research) => ({
        research,
        // Odd rows shift half a step, so a land reads as scattered islands rather than a grid.
        x: x + research.at[0] * ISLAND_STEP_X + (research.at[1] % 2 ? ISLAND_STEP_X / 2 : 0),
        y: y + research.at[1] * ISLAND_STEP_Y,
      })),
    };
  });
}

/**
 * The island itself, drawn the way the viewer builds it: an isometric plate of grass over sand over
 * soil, with little box trees standing on it. Same palette as the 3D island, so sailing in only
 * changes the scale.
 */
const ISO = { cx: 92, cy: 50, rx: 66, ry: 33 };

/** The six corners of an isometric plate, lifted by `lift` pixels. */
function plate(lift: number): string {
  const { cx, cy, rx, ry } = ISO;
  const y = cy - lift;
  return [
    [cx - rx, y],
    [cx - rx / 2, y - ry / 2],
    [cx + rx / 2, y - ry / 2],
    [cx + rx, y],
    [cx + rx / 2, y + ry / 2],
    [cx - rx / 2, y + ry / 2],
  ]
    .map(([x, py]) => `${x!.toFixed(1)},${py!.toFixed(1)}`)
    .join(" ");
}

/** The wall under a plate: the strip between one lift and the next. */
function wall(from: number, to: number, fill: string): SVGElement {
  const { cx, cy, rx, ry } = ISO;
  const a = cy - from;
  const b = cy - to;
  const d = `M${cx - rx} ${a}L${cx - rx / 2} ${a + ry / 2}L${cx} ${a + ry / 2 + 1}L${cx + rx / 2} ${a + ry / 2}L${cx + rx} ${a}L${cx + rx} ${b}L${cx + rx / 2} ${b + ry / 2}L${cx - rx / 2} ${b + ry / 2}L${cx - rx} ${b}Z`;
  return svg("path", { d, fill });
}

/** A small box tree in isometric: canopy cube on a trunk. */
function tree(x: number, y: number, tall: boolean): SVGElement[] {
  const w = tall ? 7 : 8;
  const hh = tall ? 9 : 7;
  const top = tall ? "#4f8f78" : "#5ba183";
  const left = tall ? "#356b5e" : "#3d7a6b";
  const right = tall ? "#2c5b50" : "#33685c";
  const trunkTop = y - hh;
  return [
    svg("rect", { x: String(x - 1.5), y: String(y - 5), width: "3", height: "6", fill: "#8d5e3c" }),
    svg("polygon", { points: `${x - w},${trunkTop} ${x},${trunkTop - w / 2} ${x + w},${trunkTop} ${x},${trunkTop + w / 2}`, fill: top }),
    svg("polygon", { points: `${x - w},${trunkTop} ${x},${trunkTop + w / 2} ${x},${trunkTop + w / 2 + hh} ${x - w},${trunkTop + hh}`, fill: left }),
    svg("polygon", { points: `${x + w},${trunkTop} ${x},${trunkTop + w / 2} ${x},${trunkTop + w / 2 + hh} ${x + w},${trunkTop + hh}`, fill: right }),
  ];
}

function islandArt(seed: number, locked: boolean): SVGSVGElement {
  const el = svg("svg", { viewBox: "0 0 184 110", width: "184", height: "110", class: "isle-art", "aria-hidden": "true" });
  const grass = locked ? "#cdd0ca" : "#a7d38b";
  const grassEdge = locked ? "#b9bdb6" : "#8fbd76";
  const sand = locked ? "#ded9cd" : "#efdcae";
  const sandEdge = locked ? "#c9c3b6" : "#d8c295";
  const soil = locked ? "#a9a196" : "#c79b6d";

  el.append(
    svg("ellipse", { cx: String(ISO.cx), cy: "88", rx: "66", ry: "12", fill: "rgba(37, 86, 96, 0.16)" }),
    wall(6, -18, soil),
    wall(14, 6, sandEdge),
    svg("polygon", { points: plate(14), fill: sand }),
    wall(20, 14, grassEdge),
    svg("polygon", { points: plate(20), fill: grass }),
  );

  if (locked) return el;
  // Trees scattered over the grass, always the same ones for a given repository.
  const count = 3 + (seed % 4);
  for (let i = 0; i < count; i++) {
    const across = ((seed >> (i * 2)) % 7) - 3;
    const along = ((seed >> (i * 3 + 1)) % 5) - 2;
    const x = ISO.cx + across * 13 + along * 3;
    const y = ISO.cy - 20 + along * 6 + (Math.abs(across) > 2 ? 4 : 0);
    el.append(...tree(x, y, (seed >> i) % 3 === 0));
  }
  return el;
}

/** A number that never changes for a repository: the same island every time you open the map. */
function seedOf(text: string): number {
  let seed = 7;
  for (const c of text) seed = (seed * 31 + c.charCodeAt(0)) % 9973;
  return seed;
}

export class World {
  private readonly surface = h("div", { class: "sea-surface" });
  private readonly minimap = h("div", { class: "world-minimap", "aria-hidden": "true" });
  private readonly here = h("div", { class: "world-here" });
  private spots: Spot[] = [];
  private pan = { x: 0, y: 0 };
  private drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null;
  private bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

  constructor(
    private readonly root: HTMLElement,
    private readonly options: WorldOptions,
  ) {
    this.root.classList.add("sea");
    this.root.append(this.surface, h("div", { class: "world-minimap-frame" }, this.minimap, this.here));
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);
  }

  render(map: IslandMap): void {
    clear(this.surface);
    this.spots = place(map);
    for (const spot of this.spots) {
      this.surface.append(
        h(
          "div",
          { class: "land-name", style: `left:${spot.x + (spot.islands.length - 1) * (ISLAND_STEP_X / 2)}px; top:${spot.y - 150}px` },
          h("span", { class: "land-eyebrow" }, t("world.land")),
          h("span", { class: "land-title" }, spot.land.name),
        ),
      );
      for (const island of spot.islands) this.surface.append(this.island(island));
      const next = this.nextSpot(spot);
      if (next) this.surface.append(this.portal(spot, next));
    }
    this.measure();
    this.centerOn(this.spots[0]);
    this.drawMinimap();
  }

  /** One research: the viewer's island in miniature, named by the chip it hangs over its plants. */
  private island(at: Placed): HTMLElement {
    const { research } = at;
    const [, name] = research.repo.split("/");
    const locked = this.options.locked?.(research.repo) ?? false;
    const ground = h("span", { class: "isle-ground" }, islandArt(seedOf(research.repo), locked));
    if (locked) ground.append(h("span", { class: "isle-fog" }, "🔒"));

    return h(
      "button",
      {
        class: `isle${locked ? " locked" : ""}`,
        type: "button",
        style: `left:${at.x}px; top:${at.y}px`,
        title: locked ? t("world.lockedTitle", { repo: research.repo }) : research.repo,
        onclick: () => this.options.onOpen(research),
      },
      ground,
      h(
        "span",
        { class: "label3d isle-chip" },
        h("span", { class: "label3d-name" }, locked ? t("world.lockedName") : (name ?? research.repo)),
        h("span", { class: "label3d-sub" }, locked ? t("world.lockedSub") : research.repo),
      ),
    );
  }

  /** A stone gate on the shore, pointing at the next land. */
  private portal(from: Spot, to: Spot): HTMLElement {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const spread = (from.islands.length - 1) * (ISLAND_STEP_X / 2);
    return h(
      "button",
      {
        class: "portal",
        type: "button",
        style: `left:${from.x + spread + Math.cos(angle) * 330}px; top:${from.y + Math.sin(angle) * 240 + 30}px`,
        title: t("world.portal", { name: to.land.name }),
        onclick: () => this.centerOn(to),
      },
      h("span", { class: "portal-arch" }, h("span", { class: "portal-glow" })),
      h("span", { class: "label3d portal-chip" }, h("span", { class: "label3d-name" }, to.land.name), h("span", { class: "label3d-sub" }, t("world.portalSub"))),
    );
  }

  private nextSpot(spot: Spot): Spot | null {
    if (this.spots.length < 2) return null;
    const i = this.spots.indexOf(spot);
    return this.spots[(i + 1) % this.spots.length] ?? null;
  }

  // ---------------------------------------------------------------- sailing

  private onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    this.drag = { x: e.clientX, y: e.clientY, panX: this.pan.x, panY: this.pan.y, moved: false };
    this.root.classList.add("dragging");
    this.root.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
    this.pan = { x: this.drag.panX + dx, y: this.drag.panY + dy };
    this.apply();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    this.drag = null;
    this.root.classList.remove("dragging");
    this.root.releasePointerCapture?.(e.pointerId);
  };

  private measure(): void {
    const xs = this.spots.flatMap((s) => s.islands.map((i) => i.x));
    const ys = this.spots.flatMap((s) => s.islands.map((i) => i.y));
    this.bounds = {
      minX: Math.min(0, ...xs) - 220,
      minY: Math.min(0, ...ys) - 220,
      maxX: Math.max(1, ...xs) + 220,
      maxY: Math.max(1, ...ys) + 220,
    };
  }

  /** Sail to a land: it ends up in the middle of the screen. */
  centerOn(spot: Spot | undefined): void {
    if (!spot) return;
    const r = this.root.getBoundingClientRect();
    const xs = spot.islands.map((i) => i.x);
    const ys = spot.islands.map((i) => i.y);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : spot.x;
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : spot.y;
    this.pan = { x: r.width / 2 - cx, y: r.height / 2 - cy };
    this.surface.classList.add("sailing");
    setTimeout(() => this.surface.classList.remove("sailing"), 700);
    this.apply();
  }

  goTo(name: string): void {
    this.centerOn(this.spots.find((s) => s.land.name === name));
  }

  private apply(): void {
    this.surface.style.transform = `translate(${Math.round(this.pan.x)}px, ${Math.round(this.pan.y)}px)`;
    this.drawHere();
  }

  private scale(): number {
    const { minX, minY, maxX, maxY } = this.bounds;
    return MINIMAP / Math.max(maxX - minX, maxY - minY, 1);
  }

  private drawMinimap(): void {
    clear(this.minimap);
    const { minX, minY } = this.bounds;
    const scale = this.scale();
    for (const spot of this.spots) {
      for (const island of spot.islands) {
        this.minimap.append(
          h("i", {
            class: "world-dot",
            title: island.research.repo,
            style: `left:${(island.x - minX) * scale}px; top:${(island.y - minY) * scale}px`,
          }),
        );
      }
    }
    this.drawHere();
  }

  /** The box on the minimap showing which stretch of sea is on screen. */
  private drawHere(): void {
    const r = this.root.getBoundingClientRect();
    if (!r.width) return;
    const { minX, minY } = this.bounds;
    const scale = this.scale();
    this.here.style.left = `${(-this.pan.x - minX) * scale}px`;
    this.here.style.top = `${(-this.pan.y - minY) * scale}px`;
    this.here.style.width = `${r.width * scale}px`;
    this.here.style.height = `${r.height * scale}px`;
  }

  destroy(): void {
    this.root.removeEventListener("pointerdown", this.onDown);
    this.root.removeEventListener("pointermove", this.onMove);
    this.root.removeEventListener("pointerup", this.onUp);
    this.root.removeEventListener("pointercancel", this.onUp);
    this.root.classList.remove("sea", "dragging");
    clear(this.root);
  }
}
