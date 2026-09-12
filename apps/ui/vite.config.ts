import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const DEFAULT_PROXY = "https://researchtree.thisisthepy.workers.dev";

const OFFICE_CDN = "https://appsforoffice.microsoft.com";

function cspPolicy(connect: string, script = "'self'"): string {
  return [
    "default-src 'self'",
    `script-src ${script}`,
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
  // System bars start in the sea color as drawn in 3D; src/systembars.ts repaints them per screen.
  '<meta name="theme-color" content="#a5dddb" media="(prefers-color-scheme: light)" />',
  '<meta name="theme-color" content="#8fc8c8" media="(prefers-color-scheme: dark)" />',
  // iOS home-screen app: draw under a translucent status bar (the safe-area insets keep the UI clear).
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
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
        // The add-in pages get their own policy: Office.js has to come from Microsoft's CDN, because
        // an add-in may not bundle its own copy. They also skip the installable-app tags.
        const office = ctx.path.includes("office");
        const policy = office ? cspPolicy(`${connect} ${OFFICE_CDN}`, `'self' ${OFFICE_CDN}`) : cspPolicy(connect);
        const tags = [`<meta http-equiv="Content-Security-Policy" content="${policy}" />`, ...(office ? [] : extraHead)];
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
    build: {
      ...base.build,
      target: "es2022",
      outDir: here("dist"),
      emptyOutDir: true,
      sourcemap: true,
      // The PowerPoint add-in pages ship with the web app, on the same origin: an Office sign-in
      // dialog may only start on the add-in's own domain.
      rollupOptions: { input: [here("index.html"), here("office.html"), here("office-auth.html")] },
    },
  };
});
