import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { defineComponent, h, onMounted } from "vue";
import LangSwitch from "./LangSwitch.vue";
import { setupLang, startLang } from "./lang";
import "./custom.css";

// The default theme, restyled to match the viewer (paper background, teal ink, bundled fonts), plus the
// Korean/English switch in the nav bar (see lang.ts).
export default {
  extends: DefaultTheme,
  Layout: defineComponent({
    setup() {
      onMounted(startLang);
      return () =>
        h(DefaultTheme.Layout, null, {
          "nav-bar-content-after": () => h(LangSwitch),
          "nav-screen-content-after": () => h(LangSwitch, { screen: true }),
        });
    },
  }),
  enhanceApp({ router }) {
    setupLang(router);
  },
} satisfies Theme;
