import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const DEFAULT_PROXY = "https://researchtree.thisisthepy.workers.dev";

function cspPolicy(connect: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Inject the CSP and pick the entry script. Build only: the dev server needs the HMR websocket. */
function page(entry: string, connect: string): Plugin {
  return {
    name: "researchtree-page",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const out = html.replace("/src/main.web.ts", entry);
        if (ctx.server) return out;
        return out.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${cspPolicy(connect)}" />`);
      },
    },
  };
}

/**
 * One viewer, three builds:
 * - default (web):  central web app → dist/ (GitHub Pages)
 * - `--mode serve`:  page served by `researchtree serve` → ../researchtree/server/static/
 * - `--mode extension`: webview bundle → ../extension/media/main.js + main.css (fixed names, no HTML)
 */
export default defineConfig(({ mode }): UserConfig => {
  const base: UserConfig = { root: here("."), base: "./", publicDir: false, server: { port: 5173, strictPort: true } };

  if (mode === "extension") {
    return {
      ...base,
      build: {
        target: "es2022",
        outDir: here("../extension/media"),
        emptyOutDir: true,
        sourcemap: true,
        cssCodeSplit: false,
        assetsInlineLimit: 1024 * 1024,
        rollupOptions: {
          input: here("src/main.extension.ts"),
          output: {
            format: "es",
            inlineDynamicImports: true,
            entryFileNames: "main.js",
            assetFileNames: (info) => (info.names?.some((n) => n.endsWith(".css")) ? "main.css" : "[name][extname]"),
          },
        },
      },
    };
  }

  if (mode === "serve") {
    // The local server relays every GitHub call, so the page only ever connects to itself.
    return {
      ...base,
      plugins: [page("/src/main.local.ts", "'self'")],
      build: { target: "es2022", outDir: here("../researchtree/server/static"), emptyOutDir: true, sourcemap: false },
    };
  }

  const env = loadEnv(mode, here("."), "VITE_");
  const proxy = new URL(env.VITE_AUTH_PROXY_URL || DEFAULT_PROXY).origin;
  return {
    ...base,
    plugins: [page("/src/main.web.ts", `'self' https://api.github.com ${proxy}`)],
    build: { target: "es2022", outDir: here("dist"), emptyOutDir: true, sourcemap: true },
  };
});
