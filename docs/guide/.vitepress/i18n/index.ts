import type { DefaultTheme } from "vitepress";
import { en } from "./en";
import { ko, type GuideText } from "./ko";

export type GuideLang = "ko" | "en";
export const TEXTS: Record<GuideLang, GuideText> = { ko, en };
export const LANG_KEY = "rt-guide-lang";
export const REPO = "https://github.com/DarkPyonix/researchtree";

/** The language-dependent part of the theme config. The rest (logo, links, footer) is in config.ts. */
export function themeText(l: GuideText): DefaultTheme.Config {
  const s = l.sidebar;
  return {
    nav: [
      { text: l.nav.guide, link: "/guide/introduction", activeMatch: "^/guide/" },
      { text: l.nav.rules, link: "/rules/branches", activeMatch: "^/rules/" },
      { text: l.nav.viewer, link: "/viewer/island", activeMatch: "^/viewer/" },
      { text: l.nav.dev, link: "/dev/structure", activeMatch: "^/dev/" },
      { text: l.nav.openViewer, link: "https://darkpyonix.github.io/researchtree/" },
    ],
    sidebar: [
      {
        text: s.start,
        items: [
          { text: s.introduction, link: "/guide/introduction" },
          { text: s.repoSetup, link: "/guide/repo-setup" },
          { text: s.web, link: "/guide/web" },
          { text: s.vscode, link: "/guide/vscode" },
          { text: s.powerpoint, link: "/guide/powerpoint" },
          { text: s.local, link: "/guide/local" },
        ],
      },
      {
        text: s.rules,
        items: [
          { text: s.branches, link: "/rules/branches" },
          { text: s.pullRequests, link: "/rules/pull-requests" },
          { text: s.versions, link: "/rules/versions" },
          { text: s.treeRules, link: "/rules/tree-rules" },
          { text: s.spec, link: "/rules/spec" },
        ],
      },
      {
        text: s.viewer,
        items: [
          { text: s.island, link: "/viewer/island" },
          { text: s.flat, link: "/viewer/flat" },
          { text: s.board, link: "/viewer/board" },
          { text: s.panels, link: "/viewer/panels" },
          { text: s.navigation, link: "/viewer/navigation" },
          { text: s.seasons, link: "/viewer/seasons" },
        ],
      },
      {
        text: s.more,
        items: [
          { text: s.tracking, link: "/guide/tracking" },
          { text: s.memory, link: "/guide/memory" },
          { text: s.security, link: "/guide/security" },
          { text: s.privacy, link: "/legal/privacy" },
          { text: s.terms, link: "/legal/terms" },
        ],
      },
      {
        text: s.dev,
        items: [
          { text: s.structure, link: "/dev/structure" },
          { text: s.architecture, link: "/dev/architecture" },
          { text: s.testing, link: "/dev/testing" },
          { text: s.deploy, link: "/dev/deploy" },
          { text: s.contributing, link: "/dev/contributing" },
        ],
      },
    ],
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: l.search.button, buttonAriaLabel: l.search.button },
          modal: {
            noResultsText: l.search.noResults,
            resetButtonTitle: l.search.reset,
            footer: { selectText: l.search.select, navigateText: l.search.navigate, closeText: l.search.close },
          },
        },
      },
    },
    editLink: { pattern: `${REPO}/edit/main/docs/guide/:path`, text: l.editLink },
    outline: { label: l.outline, level: [2, 3] },
    docFooter: { prev: l.prev, next: l.next },
    lastUpdated: { text: l.lastUpdated },
    returnToTopLabel: l.returnToTop,
    sidebarMenuLabel: l.menu,
    darkModeSwitchLabel: l.theme,
  };
}
