import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import { defineComponent, h, onMounted } from "vue";
import LangFlyout from "./LangFlyout.vue";
import LangSwitch from "./LangSwitch.vue";
import { lang, setupLang, startLang } from "./lang";
import { TEXTS } from "../i18n";
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
          // The wide nav bar shows the switch itself; the tablet one takes it from the flyout instead.
          "nav-bar-content-after": () => [h(LangSwitch), h(LangFlyout)],
          // On a phone the switch gets a row of its own, built like the theme row above it.
          "nav-screen-content-after": () =>
            h("div", { class: "rt-lang-screen" }, [
              h("p", { class: "rt-lang-screen-label" }, TEXTS[lang.value].language),
              h(LangSwitch, { screen: true }),
            ]),
        });
    },
  }),
  enhanceApp({ router }) {
    setupLang(router);
  },
} satisfies Theme;
