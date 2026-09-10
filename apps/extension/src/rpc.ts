import { assertApiPath, buildQuery, type GitHubRequest, type GitHubResponse, type GitHubUser, type RpcRequest, type RpcResponse } from "@researchtree/core";

const API = "https://api.github.com";

/** External capabilities used by the handler; swapped for fakes in tests. This file never imports `vscode`. */
export interface RpcDeps {
  fetch: typeof fetch;
  /** Token of the GitHub session. `interactive` prompts for sign-in; otherwise it only looks silently. */
  getToken(interactive: boolean): Promise<string | undefined>;
  signOut(): Promise<void>;
  initialRepo(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  checkout(branch: string): Promise<void>;
  openDiff(base: string, head: string): Promise<void>;
  currentBranch(): Promise<string | null>;
}

/** Calls GitHub with the token. The response only carries GitHub's status/headers/body. */
export async function githubFetch(deps: Pick<RpcDeps, "fetch">, token: string | undefined, req: GitHubRequest): Promise<GitHubResponse> {
  assertApiPath(req.path);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "researchtree-extension",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (req.etag) headers["If-None-Match"] = req.etag;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await deps.fetch(API + req.path + buildQuery(req.query), {
    method: req.method,
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
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

async function fetchUser(deps: RpcDeps, token: string): Promise<GitHubUser | null> {
  const res = await githubFetch(deps, token, { method: "GET", path: "/user" });
  if (res.status === 401) return null;
  if (res.status !== 200) throw new Error(`GitHub API ${res.status}`);
  const u = res.data as GitHubUser;
  // Pass only the fields we need.
  return { login: u.login, avatar_url: u.avatar_url, name: u.name ?? null };
}

function isHttpUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function isBranchName(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length < 256 && !s.startsWith("-") && !/[\s~^:?*[\\]|\.\.|@\{/.test(s);
}

async function dispatch(deps: RpcDeps, msg: RpcRequest): Promise<unknown> {
  switch (msg.type) {
    case "auth.current": {
      const token = await deps.getToken(false);
      return token ? await fetchUser(deps, token) : null;
    }
    case "auth.signIn": {
      const token = await deps.getToken(true);
      if (!token) throw new Error("GitHub 로그인이 취소되었습니다.");
      const user = await fetchUser(deps, token);
      if (!user) throw new Error("GitHub 토큰이 유효하지 않습니다.");
      return user;
    }
    case "auth.signOut":
      await deps.signOut();
      return null;
    case "github": {
      const req = msg.req;
      if (!req || typeof req.path !== "string") throw new Error("잘못된 GitHub 요청");
      if (!["GET", "POST", "PATCH", "PUT"].includes(req.method)) throw new Error(`허용되지 않는 메서드: ${String(req.method)}`);
      assertApiPath(req.path);
      return await githubFetch(deps, await deps.getToken(false), req);
    }
    case "initialRepo":
      return await deps.initialRepo();
    case "openExternal":
      if (!isHttpUrl(msg.url)) throw new Error("http(s) 주소만 열 수 있습니다.");
      await deps.openExternal(msg.url);
      return null;
    case "checkout":
      if (!isBranchName(msg.branch)) throw new Error("잘못된 브랜치 이름");
      await deps.checkout(msg.branch);
      return null;
    case "openDiff":
      if (!isBranchName(msg.base) || !isBranchName(msg.head)) throw new Error("잘못된 브랜치 이름");
      await deps.openDiff(msg.base, msg.head);
      return null;
    case "currentBranch":
      return await deps.currentBranch();
    default:
      throw new Error(`알 수 없는 요청: ${String((msg as { type?: unknown }).type)}`);
  }
}

/** Handles one webview message and builds the reply. Malformed messages yield `null` (ignored). */
export async function handleMessage(deps: RpcDeps, msg: unknown): Promise<RpcResponse | null> {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Partial<RpcRequest>;
  if (typeof m.id !== "number" || typeof m.type !== "string") return null;
  try {
    return { id: m.id, ok: true, result: await dispatch(deps, m as RpcRequest) };
  } catch (e) {
    return { id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
