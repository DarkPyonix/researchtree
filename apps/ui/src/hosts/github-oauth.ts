/**
 * The GitHub OAuth web flow, shared by the hosts that run in a browser: the central web app
 * (a redirect on the page itself) and the PowerPoint add-in (the same flow inside an Office dialog).
 *
 * The client secret never comes near the browser: the code is exchanged for a token by the auth
 * proxy (apps/proxy), and the token is only ever sent to api.github.com.
 */
import { t } from "@researchtree/core";

export const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";
export const PROXY_URL = import.meta.env.VITE_AUTH_PROXY_URL || "https://researchtree.thisisthepy.workers.dev";
const USE_PKCE = import.meta.env.VITE_OAUTH_PKCE === "true";

export function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Where GitHub sends the reader back. The OAuth App callback URL must equal it or be a parent of it. */
export function authorizeUrl(opts: { redirectUri: string; state: string; verifier?: string }): Promise<string> {
  return (async () => {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", CLIENT_ID);
    url.searchParams.set("redirect_uri", opts.redirectUri);
    url.searchParams.set("scope", "repo");
    url.searchParams.set("state", opts.state);
    url.searchParams.set("allow_signup", "true");
    if (opts.verifier) {
      url.searchParams.set("code_challenge", await sha256Base64Url(opts.verifier));
      url.searchParams.set("code_challenge_method", "S256");
    }
    return url.toString();
  })();
}

/** A PKCE verifier when this build uses PKCE, otherwise none. */
export function newVerifier(): string | undefined {
  return USE_PKCE ? randomString(48) : undefined;
}

/** Trade the code for a token through the proxy. Returns the token or the reason it failed. */
export async function exchangeCode(code: string, verifier?: string): Promise<{ token: string } | { error: string }> {
  const res = await fetch(`${PROXY_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier }),
  }).catch(() => null);
  if (!res) return { error: t("web.proxyUnreachable") };
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) return { error: data.error_description ?? data.error ?? t("web.noToken") };
  return { token: data.access_token };
}
