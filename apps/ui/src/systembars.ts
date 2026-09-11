/**
 * Colors of the phone's status and navigation bars (installed app and mobile browsers), set through
 * the theme-color tags the web build adds (see PWA_HEAD in vite.config.ts). The bars take the color
 * of what is under them: the sea in the 3D view, the page background everywhere else.
 */

/** The sea as it looks in the 3D view, in the light and the dark palette (same values as vite.config.ts). */
const SEA = { light: "#a5dddb", dark: "#8fc8c8" } as const;

let overSea = false;
let watching = false;

export function paintSystemBars(sea: boolean = overSea): void {
  overSea = sea;
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) return; // local server and VS Code builds have no system bars to paint
  const root = document.documentElement;
  const dark = root.dataset.theme === "dark";
  const color = sea ? SEA[dark ? "dark" : "light"] : getComputedStyle(root).getPropertyValue("--bg").trim();
  for (const meta of metas) {
    meta.content = color;
    meta.removeAttribute("media"); // the palette is already resolved here
  }
  if (!watching) {
    watching = true;
    new MutationObserver(() => paintSystemBars()).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  }
}
