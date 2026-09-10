import { startApp } from "./app";
import { completeOAuthRedirect, createWebHost } from "./hosts/web";
import { applyLocale } from "./locale";
import { loginScreen } from "./screens";

// Central web entry.
async function main() {
  const root = document.getElementById("app")!;
  const host = createWebHost();
  // Before the OAuth redirect is handled, so its error messages are already localized.
  applyLocale(host);
  const result = await completeOAuthRedirect();
  if (result?.error) {
    root.append(loginScreen({ host, error: result.error, onSignedIn: () => location.reload() }));
    return;
  }
  await startApp(host, root);
}

void main();

// Installed-app support (see pwa/sw.js). Production builds only: the dev server has no sw.js.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js").catch(() => undefined));
}
