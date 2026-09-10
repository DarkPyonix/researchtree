import {
  assertApiPath,
  buildQuery,
  HttpError,
  t,
  type GitHubRequest,
  type GitHubResponse,
  type GitHubUser,
  type Host,
  type SignInUI,
} from "@researchtree/core";
import { localStore, openInNewTab, repoFromUrl } from "../host-utils";

const SESSION_HEADER = "X-ResearchTree-Session";

/** Per-run session token injected into index.html by `researchtree serve`. */
function sessionToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="researchtree-session"]')?.content ?? "";
}

interface AuthState {
  logged_in: boolean;
  login: string | null;
  avatar_url: string | null;
  name?: string | null;
}

interface DeviceStart {
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DevicePoll extends Partial<AuthState> {
  status: "pending" | "ok" | "expired" | "denied";
  interval?: number;
  message?: string;
}

function toUser(s: Partial<AuthState>): GitHubUser | null {
  return s.logged_in && s.login ? { login: s.login, avatar_url: s.avatar_url ?? "", name: s.name ?? null } : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Host for `researchtree serve`. The token stays in the Python server; the browser only talks to same-origin `/api/*`. */
export function createLocalHost(): Host {
  const session = sessionToken();

  async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { [SESSION_HEADER]: session };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new HttpError(res.status, data.error ?? t("local.serverError", { status: res.status }), data);
    return data;
  }

  return {
    kind: "local",
    storage: localStore(),
    auth: {
      async current() {
        return toUser(await api<AuthState>("GET", "/api/auth"));
      },
      availability: () => ({ ok: true }),
      async signIn(ui: SignInUI) {
        const start = await api<DeviceStart>("POST", "/api/auth/device");
        ui.showDeviceCode({ userCode: start.user_code, verificationUri: start.verification_uri, expiresIn: start.expires_in });
        let interval = Math.max(start.interval, 1);
        const deadline = Date.now() + start.expires_in * 1000;
        while (Date.now() < deadline) {
          await sleep(interval * 1000);
          const res = await api<DevicePoll>("GET", "/api/auth/device/poll");
          if (res.status === "ok") {
            const user = toUser({ logged_in: true, ...res }) ?? toUser(await api<AuthState>("GET", "/api/auth"));
            if (!user) throw new Error(t("local.userFailed"));
            return user;
          }
          if (res.status === "expired") throw new Error(t("local.codeExpired"));
          if (res.status === "denied") throw new Error(t("local.denied"));
          if (res.interval) interval = Math.max(res.interval, 1);
        }
        throw new Error(t("local.codeExpired"));
      },
      async signOut() {
        await api("POST", "/api/auth/logout");
      },
    },
    async request(req: GitHubRequest): Promise<GitHubResponse> {
      assertApiPath(req.path);
      const headers: Record<string, string> = { [SESSION_HEADER]: session };
      if (req.etag) headers["If-None-Match"] = req.etag;
      if (req.body !== undefined) headers["Content-Type"] = "application/json";

      const res = await fetch("/api/github" + req.path + buildQuery(req.query), {
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
      const fromUrl = repoFromUrl();
      if (fromUrl) return fromUrl;
      try {
        return (await api<{ repo: string | null }>("GET", "/api/context")).repo;
      } catch {
        return null;
      }
    },
    openExternal: openInNewTab,
    capabilities: {},
  };
}
