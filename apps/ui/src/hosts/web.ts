import { assertApiPath, buildQuery, HttpError, isTokenRejected, t, type GitHubRequest, type GitHubResponse, type GitHubUser, type Host } from "@researchtree/core";
import { localStore, openInNewTab, repoFromUrl } from "../host-utils";
import { authorizeUrl, CLIENT_ID, exchangeCode, newVerifier, randomString } from "./github-oauth";

const API = "https://api.github.com";
export const TOKEN_KEY = "token";
const PENDING_KEY = "researchtree.oauth";

interface Pending {
  state: string;
  verifier?: string;
  /** Query string to return to after sign-in (repo, node) */
  returnTo: string;
}

/** Current page URL without query. The OAuth App callback URL must equal it or be a parent of it. */
function redirectUri(): string {
  return location.origin + location.pathname;
}

export async function fetchUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  // The body says why (e.g. "Bad credentials"); isTokenRejected reads it.
  if (!res.ok) throw new HttpError(res.status, `GitHub API ${res.status}`, data);
  return data as GitHubUser;
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
  if (!pending || pending.state !== state) return { error: t("web.stateMismatch") };
  if (!code) return { error: t("web.noToken") };

  const result = await exchangeCode(code, pending.verifier);
  if ("error" in result) return result;
  localStore().set(TOKEN_KEY, result.token);
  return {};
}

/** One GitHub call, straight from the browser. The token is only ever sent to api.github.com. */
export async function githubRequest(token: string | undefined, req: GitHubRequest): Promise<GitHubResponse> {
  assertApiPath(req.path);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
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
          if (!isTokenRejected(e)) throw e;
          storage.set(TOKEN_KEY, undefined);
          return null;
        }
      },
      availability() {
        return CLIENT_ID ? { ok: true } : { ok: false, reason: t("web.noClientId") };
      },
      async signIn() {
        if (!CLIENT_ID) throw new Error(t("web.noClientIdShort"));
        const pending: Pending = { state: randomString(), verifier: newVerifier(), returnTo: location.search };
        const url = await authorizeUrl({ redirectUri: redirectUri(), state: pending.state, verifier: pending.verifier });
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
        location.assign(url);
        return new Promise<never>(() => {});
      },
      async signOut() {
        storage.set(TOKEN_KEY, undefined);
      },
    },
    request: (req) => githubRequest(token(), req),
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
