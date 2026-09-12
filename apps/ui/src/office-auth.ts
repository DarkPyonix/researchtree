/**
 * The page inside the Office sign-in dialog (office-auth.html).
 *
 * It runs twice: first to send the reader to GitHub, then again when GitHub sends them back with a
 * code. The code is exchanged through the proxy here, and only the result goes to the add-in with
 * `messageParent`. The dialog must start on the add-in's own domain, which is why this page exists
 * instead of opening github.com directly.
 */
import { t } from "@researchtree/core";
import { authorizeUrl, exchangeCode, newVerifier, randomString } from "./hosts/github-oauth";
import { applyLocale } from "./locale";
import { localStore } from "./host-utils";

const PENDING_KEY = "researchtree.office-oauth";

function tell(message: { token?: string; error?: string }): void {
  Office.context.ui.messageParent(JSON.stringify(message));
}

function say(text: string): void {
  const el = document.getElementById("message");
  if (el) el.textContent = text;
}

async function main(): Promise<void> {
  applyLocale({ storage: localStore() });
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const ghError = params.get("error");
  // The dialog has its own window, so sessionStorage here is nobody else's.
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as { state: string; verifier?: string } | null;

  if (ghError) {
    tell({ error: params.get("error_description") ?? ghError });
    return;
  }

  if (!code) {
    const next = { state: randomString(), verifier: newVerifier() };
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(next));
    location.assign(await authorizeUrl({ redirectUri: location.origin + location.pathname, state: next.state, verifier: next.verifier }));
    return;
  }

  sessionStorage.removeItem(PENDING_KEY);
  if (!pending || pending.state !== state) {
    tell({ error: t("web.stateMismatch") });
    return;
  }
  say(t("office.signingIn"));
  const result = await exchangeCode(code, pending.verifier);
  tell("error" in result ? { error: result.error } : { token: result.token });
}

Office.onReady(() => {
  void main().catch((e: unknown) => tell({ error: e instanceof Error ? e.message : String(e) }));
});
