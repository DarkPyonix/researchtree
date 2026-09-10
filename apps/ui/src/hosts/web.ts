import { assertApiPath, buildQuery, HttpError, type GitHubRequest, type GitHubResponse, type GitHubUser, type Host } from "@researchtree/core";
import { localStore, openInNewTab, repoFromUrl } from "../host-utils";

const API = "https://api.github.com";
const TOKEN_KEY = "token";
const PENDING_KEY = "researchtree.oauth";

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";
const PROXY_URL = import.meta.env.VITE_AUTH_PROXY_URL || "https://researchtree.thisisthepy.workers.dev";
const USE_PKCE = import.meta.env.VITE_OAUTH_PKCE === "true";

interface Pending {
  state: string;
  verifier?: string;
  /** Query string to return to after sign-in (repo, node) */
  returnTo: string;
}

function randomString(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Current page URL without query. The OAuth App callback URL must equal it or be a parent of it. */
function redirectUri(): string {
  return location.origin + location.pathname;
}

async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) throw new HttpError(res.status, `GitHub API ${res.status}`);
  return (await res.json()) as GitHubUser;
}

/**
 * Handle the OAuth callback: exchange `code` for a token when present and restore the original URL.
 * Call once before starting the app.
 */
export async function completeOAuthRedirect(): Promise<{ error?: string } | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const ghError = params.get("error");
  if (!code && !ghError) return null;

  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as Pending | null;
  } catch {
    pending = null;
  }
  sessionStorage.removeItem(PENDING_KEY);
  // Remove the code right away so it stays out of the address bar and history.
  history.replaceState(null, "", redirectUri() + (pending?.returnTo ?? ""));

  if (ghError) return { error: params.get("error_description") ?? ghError };
  if (!pending || pending.state !== state) return { error: "로그인 요청이 일치하지 않습니다. 다시 시도해 주세요." };

  const res = await fetch(`${PROXY_URL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: pending.verifier }),
  }).catch(() => null);
  if (!res) return { error: "인증 서버에 연결할 수 없습니다." };
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    return { error: data.error_description ?? data.error ?? "토큰을 받지 못했습니다." };
  }
  localStore().set(TOKEN_KEY, data.access_token);
  return {};
}

export function createWebHost(): Host {
  const storage = localStore();
  const token = () => storage.get<string>(TOKEN_KEY);

  return {
    kind: "web",
    storage,
    auth: {
      async current() {
        const t = token();
        if (!t) return null;
        try {
          return await fetchUser(t);
        } catch (e) {
          if (e instanceof HttpError && e.status === 401) storage.set(TOKEN_KEY, undefined);
          else throw e;
          return null;
        }
      },
      availability() {
        return CLIENT_ID ? { ok: true } : { ok: false, reason: "OAuth App client ID가 설정되지 않았습니다 (VITE_GITHUB_CLIENT_ID)." };
      },
      async signIn() {
        if (!CLIENT_ID) throw new Error("OAuth App client ID가 설정되지 않았습니다.");
        const pending: Pending = { state: randomString(), returnTo: location.search };
        const url = new URL("https://github.com/login/oauth/authorize");
        url.searchParams.set("client_id", CLIENT_ID);
        url.searchParams.set("redirect_uri", redirectUri());
        url.searchParams.set("scope", "repo");
        url.searchParams.set("state", pending.state);
        url.searchParams.set("allow_signup", "true");
        if (USE_PKCE) {
          pending.verifier = randomString(48);
          url.searchParams.set("code_challenge", await sha256Base64Url(pending.verifier));
          url.searchParams.set("code_challenge_method", "S256");
        }
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        location.assign(url.toString());
        return new Promise<never>(() => {});
      },
      async signOut() {
        storage.set(TOKEN_KEY, undefined);
      },
    },
    async request(req: GitHubRequest): Promise<GitHubResponse> {
      assertApiPath(req.path);
      const t = token();
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      if (t) headers.Authorization = `Bearer ${t}`;
      if (req.etag) headers["If-None-Match"] = req.etag;
      if (req.body !== undefined) headers["Content-Type"] = "application/json";

      const res = await fetch(API + req.path + buildQuery(req.query), {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        cache: "no-store",
      });
      const out: Record<string, string> = {};
      res.headers.forEach((v, k) => (out[k.toLowerCase()] = v));
      const text = res.status === 204 || res.status === 304 ? "" : await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return { status: res.status, headers: out, data };
    },
    async initialRepo() {
      return repoFromUrl();
    },
    openExternal: openInNewTab,
    capabilities: {
      async signInWithToken(t: string) {
        const user = await fetchUser(t.trim());
        storage.set(TOKEN_KEY, t.trim());
        return user;
      },
    },
  };
}
