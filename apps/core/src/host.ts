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
}

export interface Host {
  kind: "web" | "extension" | "local";
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
