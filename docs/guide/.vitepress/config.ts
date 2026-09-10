import { defineConfig } from "vitepress";

const REPO = "https://github.com/DarkPyonix/researchtree";
const SITE = "https://darkpyonix.github.io/researchtree/guide/";

// Served from GitHub Pages at /researchtree/guide/ (the viewer app lives at /researchtree/).
export default defineConfig({
  lang: "ko-KR",
  title: "ResearchTree 가이드",
  description: "Git 브랜치와 PR로 연구 과정을 실험 트리로 기록하고 보는 방법",
  base: "/researchtree/guide/",
  cleanUrls: true,
  lastUpdated: true,
  // Lists every page for search engines at /researchtree/guide/sitemap.xml.
  sitemap: { hostname: SITE },
  head: [
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
    const path = page.relativePath.replace(/(^|\/)index\.md$/, "$1").replace(/\.md$/, "");
    const url = SITE + path;
    const title = page.frontmatter.title || page.title || "ResearchTree";
    const description = page.frontmatter.description || page.description || "Git 브랜치와 PR로 연구 과정을 실험 트리로 기록하고 보는 방법";
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
    nav: [
      { text: "가이드", link: "/guide/introduction", activeMatch: "^/guide/" },
      { text: "연구 기록 규칙", link: "/rules/branches", activeMatch: "^/rules/" },
      { text: "뷰어", link: "/viewer/island", activeMatch: "^/viewer/" },
      { text: "개발자", link: "/dev/structure", activeMatch: "^/dev/" },
      { text: "뷰어 열기", link: "https://darkpyonix.github.io/researchtree/" },
    ],

    sidebar: [
      {
        text: "시작하기",
        items: [
          { text: "소개", link: "/guide/introduction" },
          { text: "레포 준비", link: "/guide/repo-setup" },
          { text: "중앙 웹", link: "/guide/web" },
          { text: "VS Code 확장", link: "/guide/vscode" },
          { text: "로컬 실행", link: "/guide/local" },
        ],
      },
      {
        text: "연구 기록 규칙",
        items: [
          { text: "브랜치", link: "/rules/branches" },
          { text: "PR과 본문 YAML", link: "/rules/pull-requests" },
          { text: "research 버전 태그", link: "/rules/versions" },
          { text: "트리 결정 규칙", link: "/rules/tree-rules" },
          { text: "의도와 스펙 문서", link: "/rules/spec" },
        ],
      },
      {
        text: "뷰어 사용법",
        items: [
          { text: "3D 연구의 섬", link: "/viewer/island" },
          { text: "평면 보기", link: "/viewer/flat" },
          { text: "상세 패널과 버전 패널", link: "/viewer/panels" },
          { text: "탐색과 도구", link: "/viewer/navigation" },
          { text: "시간축과 계절", link: "/viewer/seasons" },
        ],
      },
      {
        text: "더 알아보기",
        items: [
          { text: "학습 스크립트 연동", link: "/guide/tracking" },
          { text: "에이전트 기억", link: "/guide/memory" },
          { text: "보안과 개인정보", link: "/guide/security" },
          { text: "개인정보 처리방침", link: "/legal/privacy" },
          { text: "이용약관", link: "/legal/terms" },
        ],
      },
      {
        text: "개발자 가이드",
        items: [
          { text: "모노레포 구조", link: "/dev/structure" },
          { text: "아키텍처", link: "/dev/architecture" },
          { text: "테스트", link: "/dev/testing" },
          { text: "배포", link: "/dev/deploy" },
          { text: "기여 규칙", link: "/dev/contributing" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: REPO }],
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "검색", buttonAriaLabel: "검색" },
          modal: {
            noResultsText: "결과가 없습니다",
            resetButtonTitle: "지우기",
            footer: { selectText: "선택", navigateText: "이동", closeText: "닫기" },
          },
        },
      },
    },
    editLink: { pattern: `${REPO}/edit/main/docs/guide/:path`, text: "이 페이지 수정하기" },
    outline: { label: "이 페이지에서", level: [2, 3] },
    docFooter: { prev: "이전", next: "다음" },
    lastUpdated: { text: "마지막 수정" },
    returnToTopLabel: "맨 위로",
    sidebarMenuLabel: "메뉴",
    darkModeSwitchLabel: "테마",
    footer: {
      message:
        'Apache-2.0 License · <a href="/researchtree/guide/legal/privacy">Privacy Policy</a> · <a href="/researchtree/guide/legal/terms">Terms of Service</a>',
      copyright: "© DarkPyonix",
    },
  },
});
