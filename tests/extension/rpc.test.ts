import { describe, expect, it, vi } from "vitest";

// rpc.ts must not depend on the `vscode` module; this mock makes any accidental import fail loudly.
vi.mock("vscode", () => {
  throw new Error("rpc.ts must not import vscode");
});

import { handleMessage, type RpcDeps } from "../../apps/extension/src/rpc";

const TOKEN = "gho_SECRET_TOKEN_123";

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 304 ? null : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ETag: '"abc"', ...headers },
  });
}

function makeDeps(over: Partial<RpcDeps> = {}) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    jsonResponse({ login: "octo", avatar_url: "https://avatars.githubusercontent.com/u/1", name: "Octo" }),
  );
  const deps: RpcDeps = {
    fetch: fetchMock as unknown as typeof fetch,
    getToken: vi.fn(async () => TOKEN),
    signOut: vi.fn(async () => {}),
    initialRepo: vi.fn(async () => "o/r"),
    openExternal: vi.fn(async () => {}),
    checkout: vi.fn(async () => {}),
    openDiff: vi.fn(async () => {}),
    currentBranch: vi.fn(async () => "experiment/a"),
    ...over,
  };
  return { deps, fetchMock };
}

describe("github 요청", () => {
  it.each(["https://evil.com/x", "//evil.com/x", "repos/o/r", "/\\evil", "javascript:alert(1)", "/https://evil.com"])(
    "잘못된 경로 %s는 거부하고 fetch하지 않는다",
    async (path) => {
      const { deps, fetchMock } = makeDeps();
      const res = await handleMessage(deps, { id: 1, type: "github", req: { method: "GET", path } });
      expect(res).toMatchObject({ id: 1, ok: false });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("허용되지 않는 메서드는 거부한다", async () => {
    const { deps, fetchMock } = makeDeps();
    const res = await handleMessage(deps, { id: 2, type: "github", req: { method: "DELETE", path: "/repos/o/r" } });
    expect(res).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("api.github.com으로 토큰과 If-None-Match를 보내고, 응답에는 토큰이 없다", async () => {
    const { deps, fetchMock } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse([{ number: 1 }], 200, { "X-RateLimit-Remaining": "59" }));
    const res = await handleMessage(deps, {
      id: 3,
      type: "github",
      req: { method: "GET", path: "/repos/o/r/pulls", query: { state: "all", per_page: 100 }, etag: '"old"' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/o/r/pulls?state=all&per_page=100");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["If-None-Match"]).toBe('"old"');
    expect(res).toMatchObject({ id: 3, ok: true, result: { status: 200, data: [{ number: 1 }] } });
    const result = (res as { result: { headers: Record<string, string> } }).result;
    expect(result.headers["x-ratelimit-remaining"]).toBe("59");
    expect(result.headers.etag).toBe('"abc"');
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });

  it("304 응답은 본문 없이 돌려준다", async () => {
    const { deps, fetchMock } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse(null, 304));
    const res = await handleMessage(deps, { id: 4, type: "github", req: { method: "GET", path: "/repos/o/r/pulls", etag: '"abc"' } });
    expect(res).toMatchObject({ ok: true, result: { status: 304, data: null } });
  });
});

describe("토큰 비노출", () => {
  it("auth.current / auth.signIn 응답에 토큰이 들어가지 않는다", async () => {
    const { deps, fetchMock } = makeDeps();
    fetchMock.mockImplementation(async () =>
      // Even if GitHub echoed extra fields, only login/avatar_url/name are forwarded.
      jsonResponse({ login: "octo", avatar_url: "a", name: null, token: TOKEN }),
    );
    for (const type of ["auth.current", "auth.signIn"] as const) {
      const res = await handleMessage(deps, { id: 5, type });
      expect(res).toMatchObject({ ok: true, result: { login: "octo" } });
      expect(JSON.stringify(res)).not.toContain(TOKEN);
    }
  });

  it("fetch 오류 메시지에도 토큰이 없다", async () => {
    const { deps, fetchMock } = makeDeps();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await handleMessage(deps, { id: 6, type: "github", req: { method: "GET", path: "/user" } });
    expect(res).toMatchObject({ ok: false, error: "fetch failed" });
    expect(JSON.stringify(res)).not.toContain(TOKEN);
  });
});

describe("auth", () => {
  it("조용한 세션이 없으면 auth.current는 null이고 GitHub을 부르지 않는다", async () => {
    const { deps, fetchMock } = makeDeps({ getToken: vi.fn(async () => undefined) });
    const res = await handleMessage(deps, { id: 7, type: "auth.current" });
    expect(res).toEqual({ id: 7, ok: true, result: null });
    expect(deps.getToken).toHaveBeenCalledWith(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("auth.signIn은 대화형으로 세션을 요청한다", async () => {
    const { deps } = makeDeps();
    await handleMessage(deps, { id: 8, type: "auth.signIn" });
    expect(deps.getToken).toHaveBeenCalledWith(true);
  });

  it("401이면 auth.current는 null이다", async () => {
    const { deps, fetchMock } = makeDeps();
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Bad credentials" }, 401));
    expect(await handleMessage(deps, { id: 9, type: "auth.current" })).toEqual({ id: 9, ok: true, result: null });
  });
});

describe("openExternal", () => {
  it.each(["javascript:alert(1)", "file:///etc/passwd", "vscode://settings", "command:workbench.action.quit", "not a url", ""])(
    "%s는 거부한다",
    async (url) => {
      const { deps } = makeDeps();
      const res = await handleMessage(deps, { id: 10, type: "openExternal", url });
      expect(res).toMatchObject({ ok: false });
      expect(deps.openExternal).not.toHaveBeenCalled();
    },
  );

  it("https 주소는 연다", async () => {
    const { deps } = makeDeps();
    const res = await handleMessage(deps, { id: 11, type: "openExternal", url: "https://github.com/o/r/pull/1" });
    expect(res).toMatchObject({ ok: true });
    expect(deps.openExternal).toHaveBeenCalledWith("https://github.com/o/r/pull/1");
  });
});

describe("git 요청", () => {
  it("브랜치 이름을 검증한다", async () => {
    const { deps } = makeDeps();
    expect(await handleMessage(deps, { id: 12, type: "checkout", branch: "--force" })).toMatchObject({ ok: false });
    expect(await handleMessage(deps, { id: 13, type: "openDiff", base: "a..b", head: "experiment/x" })).toMatchObject({ ok: false });
    expect(deps.checkout).not.toHaveBeenCalled();
    expect(await handleMessage(deps, { id: 14, type: "checkout", branch: "experiment/depth-lr-half" })).toMatchObject({ ok: true });
    expect(deps.checkout).toHaveBeenCalledWith("experiment/depth-lr-half");
  });

  it("형식이 틀린 메시지는 무시한다", async () => {
    const { deps } = makeDeps();
    expect(await handleMessage(deps, null)).toBeNull();
    expect(await handleMessage(deps, { type: "auth.current" })).toBeNull();
    expect(await handleMessage(deps, { id: 15, type: "nope" })).toMatchObject({ ok: false });
  });
});
