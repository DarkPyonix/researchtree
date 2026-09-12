/**
 * The scroll that unrolls at the top of the screen when you arrive somewhere, the way a game
 * announces the map you just entered: it opens, names the place, and rolls itself back up.
 *
 * Used when a repository opens (docs/ISLAND.md), and later when stepping through a portal into
 * another land. Nobody has to wait for it: a click rolls it up at once, and it never takes a
 * pointer event away from the scene behind it.
 */
import { h } from "./dom";
import { reducedMotion } from "./theme";

const OPEN_MS = 620;
const HOLD_MS = 2600;
const CLOSE_MS = 460;

export interface ScrollBannerText {
  /** Small line above the title: what kind of place this is. */
  eyebrow?: string;
  title: string;
  /** One line under the title, e.g. the repository description. */
  body?: string;
}

export class ScrollBanner {
  private el: HTMLElement | null = null;
  private timers: number[] = [];

  constructor(private readonly parent: HTMLElement) {}

  /** Unroll, hold, roll up. Calling it again replaces whatever is on screen. */
  show(text: ScrollBannerText): void {
    this.clearTimers();
    this.el?.remove();

    const paper = h(
      "div",
      { class: "scroll-paper" },
      text.eyebrow ? h("p", { class: "scroll-eyebrow" }, text.eyebrow) : null,
      h("h2", { class: "scroll-title" }, text.title),
      text.body ? h("p", { class: "scroll-body" }, text.body) : null,
    );
    const el = h(
      "div",
      { class: "scroll-banner", role: "status", "aria-live": "polite", onclick: () => this.hide() },
      h("span", { class: "scroll-rod left" }),
      h("div", { class: "scroll-sheet" }, paper),
      h("span", { class: "scroll-rod right" }),
    );
    this.el = el;
    this.parent.append(el);
    this.keepClearOfRepoCard(el);

    if (reducedMotion()) {
      el.classList.add("open", "instant");
      this.timers.push(window.setTimeout(() => this.hide(), HOLD_MS));
      return;
    }
    // One frame with the sheet still rolled up, so the opening actually animates.
    requestAnimationFrame(() => el.classList.add("open"));
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
