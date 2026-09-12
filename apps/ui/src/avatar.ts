/**
 * A GitHub profile picture, asked for at the size it is drawn.
 *
 * The API hands out the full-size picture (460px, ~40KB); at 22px on screen that is a white hole in
 * the toolbar until it arrives. GitHub resizes on request — `?s=44` is the same picture at 1.4KB —
 * so every avatar asks for twice its drawn size, which is sharp on a retina screen and small enough
 * to arrive with the rest of the page.
 */
import { h } from "./dom";

export function avatar(url: string, size: number): HTMLImageElement {
  let src = url;
  try {
    const at = new URL(url);
    at.searchParams.set("s", String(size * 2));
    src = at.toString();
  } catch {
    // Not a URL we can add to: use it as it is.
  }
  return h("img", {
    class: "avatar",
    src,
    alt: "",
    width: String(size),
    height: String(size),
    decoding: "async",
  }) as HTMLImageElement;
}
