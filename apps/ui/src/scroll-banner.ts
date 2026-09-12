/**
 * The scroll that unrolls at the top of the screen when you arrive somewhere, the way a game
 * announces the map you just entered: the two coils part, the paper opens between them, it names
 * the place, and then it rolls itself back up.
 *
 * The drawings live in banner-art.ts — one for a research, another for an account's island map, so
 * the two arrivals do not look alike. Nobody has to wait for it: a click rolls it up at once, and it
 * never takes a pointer event away from the scene behind it.
 */
import { SCROLL_ART, type ScrollArt } from "./banner-art";
import { h } from "./dom";
import { reducedMotion } from "./theme";

const OPEN_MS = 620;
const HOLD_MS = 2600;
const CLOSE_MS = 460;

export type ScrollKind = "tree" | "island";

export interface ScrollBannerText {
  /** Small line above the title: what kind of place this is. */
  eyebrow?: string;
  title: string;
  /** One line under the title, e.g. the repository description. */
  body?: string;
  /** Which drawing unrolls. A research by default. */
  kind?: ScrollKind;
}

/** The drawing as a live SVG element. Parsed, not assigned as markup, so nothing is ever injected. */
function drawing(art: ScrollArt): SVGSVGElement {
  const doc = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 200" aria-hidden="true">${art.svg}</svg>`,
    "image/svg+xml",
  );
  const svg = doc.documentElement as unknown as SVGSVGElement;
  // The animation asks for the parts by name; the drawings label them the same way.
  for (const [id, role] of [
    ["roll-left", "left"],
    ["roll-right", "right"],
    ["sheet", "sheet"],
    ["shadow", "shadow"],
  ] as const) {
    svg.querySelector(`[id$="-${id}"]`)?.setAttribute("data-part", role);
  }
  return svg;
}

export class ScrollBanner {
  private el: HTMLElement | null = null;
  private timers: number[] = [];

  constructor(private readonly parent: HTMLElement) {}

  /** Unroll, hold, roll up. Calling it again replaces whatever is on screen. */
  show(text: ScrollBannerText): void {
    this.clearTimers();
    this.el?.remove();

    const art = SCROLL_ART[text.kind ?? "tree"];
    const paper = h(
      "div",
      { class: "scroll-paper" },
      text.eyebrow ? h("p", { class: "scroll-eyebrow" }, text.eyebrow) : null,
      h("h2", { class: "scroll-title" }, text.title),
      text.body ? h("p", { class: "scroll-body" }, text.body) : null,
    );
    paper.style.left = `${art.text.left}%`;
    paper.style.top = `${art.text.top}%`;
    paper.style.width = `${art.text.width}%`;
    paper.style.height = `${art.text.height}%`;

    const el = h("div", { class: `scroll-banner ${text.kind ?? "tree"}`, role: "status", "aria-live": "polite", onclick: () => this.hide() });
    el.append(drawing(art), paper);
    this.el = el;
    this.parent.append(el);
    this.keepClearOfRepoCard(el);

    if (reducedMotion()) {
      el.classList.add("open", "instant");
      this.timers.push(window.setTimeout(() => this.hide(), HOLD_MS));
      return;
    }
    // A painted frame with the scroll still rolled up, or there is nothing to animate from.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("open")));
    this.timers.push(window.setTimeout(() => this.hide(), OPEN_MS + HOLD_MS));
  }

  /**
   * On a phone the repo card spans the whole width, so a scroll at the top of the screen would
   * unroll over it. Where they would collide, the scroll hangs below the card instead.
   */
  private keepClearOfRepoCard(el: HTMLElement): void {
    const card = this.parent.querySelector(".brand-stack");
    if (!card) return;
    // Next frame: the sheet has to be laid out before its box means anything.
    requestAnimationFrame(() => {
      const parent = this.parent.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const sideBySide = b.left >= c.right || b.right <= c.left;
      if (sideBySide || b.top >= c.bottom) return;
      el.style.top = `${Math.round(c.bottom - parent.top + 12)}px`;
    });
  }

  /** Roll it up now. Safe to call when nothing is showing. */
  hide(): void {
    const el = this.el;
    if (!el) return;
    this.clearTimers();
    this.el = null;
    el.classList.remove("open");
    el.classList.add("closing");
    this.timers.push(window.setTimeout(() => el.remove(), reducedMotion() ? 0 : CLOSE_MS));
  }

  destroy(): void {
    this.clearTimers();
    this.el?.remove();
    this.el = null;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}

/** The scroll's text for a repository: "연구" over the repo name, with its description under it. */
export function repoBanner(repo: string, description: string | null, kind: string): ScrollBannerText {
  const [, name] = repo.split("/");
  return { eyebrow: kind, title: name ?? repo, body: description ?? undefined };
}
