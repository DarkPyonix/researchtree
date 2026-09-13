/**
 * The travel map of an account's research (docs/ISLAND.md).
 *
 * It is a tool, not the world: every island is out there on the sea behind it at all times, and this
 * only shows where they are and sails you to one. So it is not a drawing of a map — it is the world
 * itself photographed from straight above, with a pin on each research. It opens on arrival, the way
 * a game shows its world map when you walk in, and the toolbar reopens it whenever.
 */
import { t } from "@researchtree/core";
import { h, icon } from "../dom";

export interface MapShot {
  url: string;
  width: number;
  height: number;
  /** The part of the picture that holds the islands; the rest is open sea and is cropped away. */
  crop: { x: number; y: number; w: number; h: number };
  /** World coordinates to pixels in the picture. */
  place(x: number, z: number): [number, number];
}

export interface WorldMapOptions {
  /** Whose map it is, for the heading. */
  user: string;
  /** The picture of the sea, from the view itself. */
  shot: MapShot | null;
  /** Every research on the map: where it sits, what it is called, whether it can be opened. */
  places: { repo: string; land: string; at: { x: number; z: number }; locked: boolean }[];
  /** The research the camera is on, if any. */
  here: string | null;
  /** Sail the camera to one research and close the map. */
  onSail(repo: string): void;
  /** Open a research: walk straight into its tree. */
  onOpen(repo: string): void;
}

export function worldMapDialog(opts: WorldMapOptions): HTMLElement {
  const overlay = h("div", { class: "overlay map-overlay" });
  const close = () => overlay.remove();

  const chart = h("div", { class: "map-chart" });
  const { shot } = opts;
  if (shot) {
    chart.style.aspectRatio = `${Math.round(shot.crop.w)} / ${Math.round(shot.crop.h)}`;
    const photo = h("img", { class: "map-photo", src: shot.url, alt: "", draggable: "false" }) as HTMLImageElement;
    photo.style.width = `${(shot.width / shot.crop.w) * 100}%`;
    photo.style.left = `${(-shot.crop.x / shot.crop.w) * 100}%`;
    photo.style.top = `${(-shot.crop.y / shot.crop.h) * 100}%`;
    photo.style.height = `${(shot.height / shot.crop.h) * 100}%`;
    chart.append(photo);
  }

  for (const place of opts.places) {
    const [px, py] = shot ? shot.place(place.at.x, place.at.z) : [0, 0];
    const name = place.repo.split("/")[1] ?? place.repo;
    const pin = h(
      "button",
      {
        class: `map-pin${place.locked ? " locked" : ""}${opts.here === place.repo ? " here" : ""}`,
        type: "button",
        title: place.locked ? t("world.lockedSub") : place.repo,
        onclick: () => {
          close();
          opts.onSail(place.repo);
        },
        ondblclick: () => {
          close();
          opts.onOpen(place.repo);
        },
      },
      h("span", { class: "map-pin-dot" }, place.locked ? icon("warn", 11) : icon("island", 11)),
      h("span", { class: "map-pin-name" }, place.locked ? t("world.lockedName") : name),
      h("span", { class: "map-pin-land" }, place.land),
    );
    if (shot) {
      pin.style.left = `${(((px - shot.crop.x) / shot.crop.w) * 100).toFixed(2)}%`;
      pin.style.top = `${(((py - shot.crop.y) / shot.crop.h) * 100).toFixed(2)}%`;
    }
    chart.append(pin);
  }

  const dialog = h(
    "div",
    { class: "card dialog map-dialog", role: "dialog", "aria-modal": "true", "aria-label": t("world.mapTitle") },
    h(
      "div",
      { class: "map-head" },
      h("div", null, h("div", { class: "eyebrow" }, t("world.land")), h("h2", { class: "map-title" }, t("world.title", { user: opts.user }))),
      h("button", { class: "icon-btn", type: "button", "aria-label": t("common.close"), onclick: close }, icon("close", 16)),
    ),
    chart,
    h("p", { class: "map-hint muted small" }, t("world.mapHint", { count: String(opts.places.length) })),
  );

  overlay.append(dialog);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  requestAnimationFrame(() => overlay.querySelector<HTMLElement>(".map-pin")?.focus({ preventScroll: true }));
  return overlay;
}
