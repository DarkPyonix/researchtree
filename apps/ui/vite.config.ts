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

/** Installable web app (web build only): manifest, icons and the service worker live in pwa/. */
const PWA_HEAD = [
  '<link rel="manifest" href="./manifest.webmanifest" />',
  '<meta name="theme-color" content="#f1ece3" />',
  '<link rel="apple-touch-icon" href="./apple-touch-icon.png" />',
  '<meta name="apple-mobile-web-app-title" content="ResearchTree" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
];

/** Inject the CSP (and any extra head tags) and pick the entry script. Build only: the dev server needs the HMR websocket. */
function page(entry: string, connect: string, extraHead: string[] = []): Plugin {
  return {
    name: "researchtree-page",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        const out = html.replace("/src/main.web.ts", entry);
        if (ctx.server) return out;
        const tags = [`<meta http-equiv="Content-Security-Policy" content="${cspPolicy(connect)}" />`, ...extraHead];
        return out.replace("<head>", ["<head>", ...tags].join("\n    "));
      },
    },
  };
}

/**
 * One viewer, three builds:
 * - default (web):  central web app → dist/ (GitHub Pages)
 * - `--mode serve`:  page served by `researchtree serve` → ../researchtree/server/static/
 * - `--mode extension`: webview bundle → ../extension/media/main.js + main.css (fixed names, no HTML)
 * - `--mode gallery`: season gallery (synthetic data, no network) embedded in the guide → ../../docs/guide/public/gallery/
 */
export default defineConfig(({ mode }): UserConfig => {
  const base: UserConfig = {
    root: here("."),
    base: "./",
    publicDir: false,
    server: { port: 5173, strictPort: true },
    // three.js is needed on first paint (the 3D island is the default view), so one chunk is expected.
    // Never inline assets as data: URIs; the CSPs only allow fonts from 'self' (or the webview source).
    build: { chunkSizeWarningLimit: 900, assetsInlineLimit: 0 },
  };

  if (mode === "extension") {
    return {
      ...base,
      build: {
        ...base.build,
        target: "es2022",
        outDir: here("../extension/media"),
        emptyOutDir: true,
        sourcemap: true,
        cssCodeSplit: false,
        rollupOptions: {
          input: here("src/main.extension.ts"),
          output: {
            format: "es",
            inlineDynamicImports: true,
            entryFileNames: "main.js",
            // Fonts stay separate files next to main.css (webview CSP allows font-src from the extension).
            assetFileNames: (info) => (info.names?.some((n) => n.endsWith(".css")) ? "main.css" : "fonts/[name]-[hash][extname]"),
          },
        },
      },
    };
  }

  if (mode === "gallery") {
    return {
      ...base,
      plugins: [page("/src/gallery.ts", "'none'")],
      build: {
        ...base.build,
        target: "es2022",
        outDir: here("../../docs/guide/public/gallery"),
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: { input: here("gallery.html") },
      },
    };
  }

  if (mode === "serve") {
    // The local server relays every GitHub call, so the page only ever connects to itself.
    return {
      ...base,
      plugins: [page("/src/main.local.ts", "'self'")],
      build: { ...base.build, target: "es2022", outDir: here("../researchtree/server/static"), emptyOutDir: true, sourcemap: false },
    };
  }

  const env = loadEnv(mode, here("."), "VITE_");
  const proxy = new URL(env.VITE_AUTH_PROXY_URL || DEFAULT_PROXY).origin;
  return {
    ...base,
    publicDir: here("pwa"),
    plugins: [page("/src/main.web.ts", `'self' https://api.github.com ${proxy}`, PWA_HEAD)],
    build: { ...base.build, target: "es2022", outDir: here("dist"), emptyOutDir: true, sourcemap: true },
  };
});
