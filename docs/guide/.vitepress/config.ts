import { defineConfig } from "vitepress";
import { LANG_KEY, REPO, themeText } from "./i18n";
import { ko } from "./i18n/ko";

const SITE = "https://darkpyonix.github.io/researchtree/guide/";

// Before the first paint: when the reader picked English (or the browser is not Korean), hide the page
// until the theme has swapped in the English text, so the Korean prerender never flashes. The theme
// removes the class; the timeout is a safety net. Keep the choice rule in sync with theme/lang.ts.
const LANG_BOOT = `(function(){try{var l=localStorage.getItem("${LANG_KEY}");if(!l)l=/^ko\\b/i.test(navigator.language)?"ko":"en";if(l==="en"){var d=document.documentElement;d.classList.add("rt-lang-pending");setTimeout(function(){d.classList.remove("rt-lang-pending")},2000)}}catch(e){}})()`;

// Served from GitHub Pages at /researchtree/guide/ (the viewer app lives at /researchtree/).
// One set of pages: the Korean Markdown files are the routes, and English versions of the same pages
// live under en/ (left out of the routes). The theme swaps page and chrome text in place (theme/lang.ts).
export default defineConfig({
  lang: ko.lang,
  title: ko.title,
  description: ko.description,
  base: "/researchtree/guide/",
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["en/**"],
  // Lists every page for search engines at /researchtree/guide/sitemap.xml.
  sitemap: { hostname: SITE },
  head: [
    ["script", {}, LANG_BOOT],
    ["meta", { name: "theme-color", content: "#3d7a6b" }],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/researchtree/guide/logo.svg" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "ResearchTree" }],
    ["meta", { property: "og:image", content: `${SITE}og.png` }],
    ["meta", { property: "og:image:width", content: "1200" }],
    ["meta", { property: "og:image:height", content: "630" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
  ],
  // Per-page canonical URL, title and description for search results and link previews.
  transformPageData(page) {
    // English pages (en/…) are shown at the Korean page's address.
    const path = page.relativePath.replace(/^en\//, "").replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
    const url = SITE + path;
    const title = page.frontmatter.title || page.title || "ResearchTree";
    const description = page.frontmatter.description || page.description || ko.description;
    page.frontmatter.head ??= [];
    page.frontmatter.head.push(
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
    );
  },

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "ResearchTree",
    ...themeText(ko),
    socialLinks: [{ icon: "github", link: REPO }],
    footer: {
      message:
        'Apache-2.0 License · <a href="/researchtree/guide/legal/privacy">Privacy Policy</a> · <a href="/researchtree/guide/legal/terms">Terms of Service</a>',
      copyright: "© DarkPyonix",
    },
  },
});
