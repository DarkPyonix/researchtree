import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "./custom.css";

// The default theme, restyled to match the viewer (paper background, teal ink, bundled fonts).
export default {
  extends: DefaultTheme,
} satisfies Theme;
