/**
 * Picks the light or dark palette in styles.css by setting <html data-theme>.
 * In the VS Code webview, the body carries the theme kind as a class (vscode-light, vscode-dark,
 * vscode-high-contrast, vscode-high-contrast-light) and it changes live; elsewhere the system
 * setting decides.
 */
export function followColorScheme(): void {
  const body = document.body.classList;
  const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const apply = () => {
    const dark =
      body.contains("vscode-light") || body.contains("vscode-high-contrast-light")
        ? false
        : body.contains("vscode-dark") || body.contains("vscode-high-contrast")
          ? true
          : !!media?.matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };
  apply();
  media?.addEventListener("change", apply);
  new MutationObserver(apply).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
