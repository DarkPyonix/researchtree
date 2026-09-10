import { startApp } from "./app";
import { createDemoHost } from "./hosts/demo";
import { completeOAuthRedirect, createWebHost } from "./hosts/web";
import { loginScreen } from "./screens";

// Central web entry. With `?demo`, run on the demo host backed by fake data.
async function main() {
  const root = document.getElementById("app")!;
  if (new URLSearchParams(location.search).has("demo")) {
    await startApp(createDemoHost(), root);
    return;
  }
  const result = await completeOAuthRedirect();
  const host = createWebHost();
  if (result?.error) {
    root.append(loginScreen({ host, error: result.error, onSignedIn: () => location.reload() }));
    return;
  }
  await startApp(host, root);
}

void main();
