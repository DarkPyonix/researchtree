import { t } from "./i18n";
import type { GitHubUser } from "./types";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT";

/** Request relative to `api.github.com`. Full URLs are not accepted. */
export interface GitHubRequest {
  method: HttpMethod;
  /** Like `/repos/o/r/pulls`. Must start with `/`. */
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  etag?: string;
}

export interface GitHubResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

/** Lets device-flow hosts (e.g. local) show the user code during sign-in. */
export interface SignInUI {
  showDeviceCode(info: { userCode: string; verificationUri: string; expiresIn: number }): void;
}

export interface HostCapabilities {
  checkout?(branch: string): Promise<void>;
  openDiff?(base: string, head: string): Promise<void>;
  /** Sign in by pasting a token (web host) */
  signInWithToken?(token: string): Promise<GitHubUser>;
  /**
   * Remember what is on screen with the document the viewer is embedded in (PowerPoint add-in).
   * Hosts that have an address bar do not have this: there, a link already does the job.
   */
  viewState?: {
    load(): unknown;
    save(state: unknown): Promise<void>;
  };
}

export interface Host {
  kind: "web" | "extension" | "local" | "office";
  /** Environment languages for the automatic locale. Defaults to `navigator.languages` when absent. */
  languages?: readonly string[];
  auth: {
    current(): Promise<GitHubUser | null>;
    /** Start sign-in. May never resolve when the page navigates away (web host). */
    signIn(ui: SignInUI): Promise<GitHubUser>;
    signOut(): Promise<void>;
    /** Whether sign-in is available; returns the reason when configuration is missing. */
    availability(): { ok: true } | { ok: false; reason: string };
  };
  request(req: GitHubRequest): Promise<GitHubResponse>;
  /** Repo to open first (from the URL, workspace, working directory, ...) */
  initialRepo(): Promise<string | null>;
  openExternal(url: string): void;
  storage: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
  capabilities: HostCapabilities;
}

/**
 * True when GitHub says the token itself is no good, rather than a request failing once. Only then
 * may a host throw the saved token away: a stray 401 (a captive portal, a proxy error page, a blip)
 * must not sign the user out, because a GitHub OAuth token has no expiry of its own.
 */
export function isTokenRejected(e: unknown): boolean {
  if (!(e instanceof HttpError) || e.status !== 401) return false;
  const message = (e.data as { message?: string } | undefined)?.message ?? e.message;
  return /bad credentials|token expired|token has expired|revoked|requires authentication/i.test(message);
}

/**
 * True when GitHub turned the call away for asking too often. Anonymous callers get 60 an hour per
 * address, which a guest can run into; signing in raises it to 5,000.
 */
export function isRateLimited(e: unknown): boolean {
  if (!(e instanceof HttpError) || (e.status !== 403 && e.status !== 429)) return false;
  const message = (e.data as { message?: string } | undefined)?.message ?? e.message;
  return /rate limit|too many requests/i.test(message);
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Hosts call this before sending a request so the token can never reach another domain. */
export function assertApiPath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//") || /^\/*[a-z]+:/i.test(path) || path.includes("\\")) {
    throw new Error(t("github.invalidPath", { path }));
  }
}

export function buildQuery(query: GitHubRequest["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : "";
}
