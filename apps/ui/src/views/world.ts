/**
 * The world map: every research an account shows, laid out as islands you can drag across
 * (docs/ISLAND.md).
 *
 * Two words, two things. A *land* is a project you reach through a portal; a *research island* is
 * one repository inside a land, and its own versions are the connected islands you see once you
 * walk into it. Lands sit apart on the sea; the portals between them are the only way across.
 */
import { t, type IslandLand, type IslandMap, type IslandResearch } from "@researchtree/core";
import { clear, h, icon } from "../dom";

/** Grid step in pixels: how far apart two neighbouring places sit. */
const LAND_STEP = 620;
const RESEARCH_STEP = 230;
const RESEARCH_ROW = 168;
const MINIMAP = 150;

export interface WorldOptions {
  /** Walk into one research: the viewer opens that repository. */
  onOpen(research: IslandResearch): void;
  /** Step through a portal to another land. */
  onLand?(land: IslandLand): void;
  /** Research this reader cannot open (private, or someone else's): drawn locked, like an area of a
   * game that has not been unlocked. */
  locked?(repo: string): boolean;
}

interface Placed {
  land: IslandLand;
  x: number;
  y: number;
  width: number;
  height: number;
}

function placeLands(map: IslandMap): Placed[] {
  return map.islands.map((land) => {
    const cols = Math.max(1, ...land.repos.map((r) => r.at[0] + 1));
    const rows = Math.max(1, ...land.repos.map((r) => r.at[1] + 1));
    return {
      land,
      x: land.at[0] * LAND_STEP,
      y: land.at[1] * LAND_STEP,
      width: cols * RESEARCH_STEP + 40,
      height: rows * RESEARCH_ROW + 74,
    };
  });
}

export class World {
  private readonly surface = h("div", { class: "world-surface" });
  private readonly minimap = h("div", { class: "world-minimap", "aria-hidden": "true" });
  private readonly here = h("div", { class: "world-here" });
  private placed: Placed[] = [];
  private pan = { x: 0, y: 0 };
  private drag: { x: number; y: number; panX: number; panY: number } | null = null;
  private bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(
    private readonly root: HTMLElement,
    private readonly options: WorldOptions,
  ) {
    this.root.classList.add("world");
    this.root.append(this.surface, h("div", { class: "world-minimap-frame" }, this.minimap, this.here));
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);
  }

  render(map: IslandMap): void {
    clear(this.surface);
    this.placed = placeLands(map);
    for (const spot of this.placed) this.surface.append(this.landCard(spot));
    this.measure();
    this.centerOn(this.placed[0]);
    this.drawMinimap();
  }

  private landCard(spot: Placed): HTMLElement {
    const { land } = spot;
    const card = h(
      "section",
      { class: "world-land", style: `left:${spot.x}px; top:${spot.y}px; width:${spot.width}px`, "aria-label": land.name },
      h(
        "header",
        { class: "world-land-head" },
        h("h2", null, land.name),
        h("span", { class: "world-count muted small" }, t("world.researchCount", { count: land.repos.length })),
      ),
      h(
        "div",
        { class: "world-islands", style: `height:${spot.height - 74}px` },
        land.repos.map((research) => this.researchTile(research)),
      ),
    );
    // A portal stands at the edge of a land and leads to the next one around the sea.
    const next = this.nextLand(land);
    if (this.options.onLand && next) {
      card.append(
        h(
          "button",
          { class: "world-portal", type: "button", onclick: () => this.options.onLand?.(next) },
          icon("external", 14),
          ` ${t("world.portal", { name: next.name })}`,
        ),
      );
    }
    return card;
  }

  private nextLand(land: IslandLand): IslandLand | null {
    const i = this.placed.findIndex((p) => p.land === land);
    if (i < 0 || this.placed.length < 2) return null;
    return this.placed[(i + 1) % this.placed.length]!.land;
  }

  private researchTile(research: IslandResearch): HTMLElement {
    const [, name] = research.repo.split("/");
    const locked = this.options.locked?.(research.repo) ?? false;
    return h(
      "button",
      {
        class: `world-island${locked ? " locked" : ""}`,
        type: "button",
        style: `left:${research.at[0] * RESEARCH_STEP}px; top:${research.at[1] * RESEARCH_ROW}px`,
        onclick: () => this.options.onOpen(research),
        title: locked ? t("world.lockedTitle", { repo: research.repo }) : research.repo,
      },
      h("span", { class: "world-island-shape" }, locked ? h("span", { class: "world-lock" }, "🔒") : null),
      h("span", { class: "world-island-name" }, locked ? t("world.lockedName") : (name ?? research.repo)),
      h("span", { class: "world-island-repo muted small" }, locked ? t("world.lockedSub") : research.repo),
    );
  }

  // ---------------------------------------------------------------- panning

  private onDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    this.drag = { x: e.clientX, y: e.clientY, panX: this.pan.x, panY: this.pan.y };
    this.root.classList.add("dragging");
    this.root.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    this.pan = { x: this.drag.panX + (e.clientX - this.drag.x), y: this.drag.panY + (e.clientY - this.drag.y) };
    this.apply();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag) return;
    this.drag = null;
    this.root.classList.remove("dragging");
    this.root.releasePointerCapture?.(e.pointerId);
  };

  private measure(): void {
    const xs = this.placed.flatMap((p) => [p.x, p.x + p.width]);
    const ys = this.placed.flatMap((p) => [p.y, p.y + p.height]);
    this.bounds = {
      minX: Math.min(0, ...xs),
      minY: Math.min(0, ...ys),
      maxX: Math.max(1, ...xs),
      maxY: Math.max(1, ...ys),
    };
  }

  /** Bring one land into the middle of the screen. */
  centerOn(spot: Placed | undefined): void {
    if (!spot) return;
    const r = this.root.getBoundingClientRect();
    this.pan = { x: r.width / 2 - (spot.x + spot.width / 2), y: r.height / 2 - (spot.y + spot.height / 2) };
    this.apply();
  }

  /** Walk to a land by name (the portals use this). */
  goTo(name: string): void {
    this.centerOn(this.placed.find((p) => p.land.name === name));
  }

  private apply(): void {
    this.surface.style.transform = `translate(${Math.round(this.pan.x)}px, ${Math.round(this.pan.y)}px)`;
    this.drawHere();
  }

  private drawMinimap(): void {
    clear(this.minimap);
    const { minX, minY, maxX, maxY } = this.bounds;
    const scale = MINIMAP / Math.max(maxX - minX, maxY - minY, 1);
    for (const spot of this.placed) {
      this.minimap.append(
        h("i", {
          class: "world-dot",
          title: spot.land.name,
          style: `left:${(spot.x - minX) * scale}px; top:${(spot.y - minY) * scale}px; width:${Math.max(6, spot.width * scale)}px; height:${Math.max(6, spot.height * scale)}px`,
        }),
      );
    }
    this.drawHere();
  }

  /** The box on the minimap showing which part of the sea is on screen. */
  private drawHere(): void {
    const r = this.root.getBoundingClientRect();
    if (!r.width) return;
    const { minX, minY, maxX, maxY } = this.bounds;
    const scale = MINIMAP / Math.max(maxX - minX, maxY - minY, 1);
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
    this.root.classList.remove("world", "dragging");
    clear(this.root);
  }
}
