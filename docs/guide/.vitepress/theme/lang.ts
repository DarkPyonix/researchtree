// Language switching without a second set of pages. Every route is a Korean Markdown page; its English
// version is the file at the same path under docs/guide/en/. In English the theme swaps, in place:
//   - the site data (title, nav, sidebar, labels) for the one built from i18n/en.ts, and
//   - each page's component and data for the English file, when there is one (otherwise it stays Korean).
// Switching back loads the Korean file the same way: a page that was swapped out cannot simply be put
// back, its saved component renders nothing.
// The prerendered HTML is Korean, so the swap waits until the app has mounted (hydration must match).
import { markRaw, ref, watch, type Component } from "vue";
import type { PageData, Router, SiteData } from "vitepress";
// Not public API: the one ref every useData() reads the site config from. Replacing it re-renders the chrome.
import { siteDataRef } from "vitepress/dist/client/app/data.js";
import { LANG_KEY, TEXTS, themeText, type GuideLang } from "../i18n";

interface PageModule {
  default: Component;
  __pageData: PageData;
}

/** Both languages are loaded the same way, so both render the same way (a restored page did not). */
const PAGES: Record<GuideLang, Record<string, () => Promise<PageModule>>> = {
  en: import.meta.glob<PageModule>("../../en/**/*.md"),
  ko: import.meta.glob<PageModule>("../../**/*.md"),
};
const loaded = new Map<string, PageModule>();
/** Which language each page data object is: the router's own is always the Korean one. */
const shown = new WeakMap<object, GuideLang>();

export const lang = ref<GuideLang>("ko");
/** The reader's language: the page loads its English file ahead when this is "en". */
let wanted: GuideLang = "ko";
let router: Router | null = null;
let koSite: SiteData | null = null;
let mounted = false;

function preferred(): GuideLang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch {
    // Storage blocked: fall through to the browser language.
  }
  return /^ko\b/i.test(navigator.language) ? "ko" : "en";
}

/** "/researchtree/guide/rules/spec#x" -> "rules/spec.md"; "/researchtree/guide/" -> "index.md". */
function relativePathOf(href: string): string {
  const base = koSite?.base ?? "/";
  let path = decodeURI(new URL(href, location.href).pathname);
  if (path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/\.html$/, "");
  return !path || path.endsWith("/") ? `${path}index.md` : `${path}.md`;
}

/** `index.md` in English is `../../en/index.md`; in Korean it is the page itself. */
function keyOf(l: GuideLang, relativePath: string): string {
  return l === "en" ? `../../en/${relativePath}` : `../../${relativePath}`;
}

async function load(l: GuideLang, relativePath: string): Promise<PageModule | null> {
  const key = keyOf(l, relativePath);
  const importer = PAGES[l][key];
  if (!importer) return null;
  if (!loaded.has(key)) loaded.set(key, await importer());
  return loaded.get(key)!;
}

function applySite(l: GuideLang): void {
  if (!koSite) return;
  const text = TEXTS[l];
  siteDataRef.value =
    l === "ko"
      ? koSite
      : { ...koSite, lang: text.lang, title: text.title, description: text.description, themeConfig: { ...koSite.themeConfig, ...themeText(text) } };
  document.documentElement.lang = text.lang;
}

/** Put the page in the reader's language on screen, if that version is loaded and not already there. */
function swapPage(): void {
  if (!router || !mounted) return;
  const route = router.route;
  const want = lang.value;
  if ((shown.get(route.data) ?? "ko") === want) return;
  const mod = loaded.get(keyOf(want, route.data.relativePath));
  if (!mod) return;
  // Whichever language it is, the page keeps the Korean path, so sidebar, edit link and prev/next match.
  const data = markRaw({ ...mod.__pageData, relativePath: route.data.relativePath, filePath: route.data.filePath });
  shown.set(data, want);
  route.component = markRaw(mod.default);
  route.data = data;
}

export async function setLang(l: GuideLang, save = true): Promise<void> {
  wanted = l;
  lang.value = l;
  if (save) {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // Not saved; the choice lasts for this visit.
    }
  }
  applySite(l);
  if (!router) return;
  await load(l, router.route.data.relativePath);
  swapPage();
  document.documentElement.classList.remove("rt-lang-pending");
}

/** Called from enhanceApp. Loads the English file before each page change, then swaps it in. */
export function setupLang(r: Router): void {
  if (typeof window === "undefined") return;
  router = r;
  koSite = siteDataRef.value;
  wanted = preferred();
  const before = r.onBeforePageLoad;
  r.onBeforePageLoad = async (href) => {
    if (wanted === "en") await load(wanted, relativePathOf(href));
    return before?.(href);
  };
  watch(() => r.route.data, swapPage, { flush: "sync" });
}

/** Called once the app has mounted: switch to the reader's language. */
export function startLang(): void {
  mounted = true;
  void setLang(wanted, false);
}
