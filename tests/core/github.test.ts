import { describe, expect, it } from "vitest";
import { assertApiPath, GitHubClient, HttpError, nextPage, parseRepo, repoFromRemote, type GitHubRequest, type GitHubResponse, type Host } from "../../apps/core/src";

function fakeHost(handler: (req: GitHubRequest) => GitHubResponse): Host & { calls: GitHubRequest[] } {
  const calls: GitHubRequest[] = [];
  return {
    kind: "demo",
    calls,
    auth: {
      current: async () => null,
      signIn: async () => ({ login: "x", avatar_url: "" }),
      signOut: async () => {},
      availability: () => ({ ok: true }),
    },
    request: async (req) => {
      calls.push(req);
      return handler(req);
    },
    initialRepo: async () => null,
    openExternal: () => {},
    storage: { get: () => undefined, set: () => {} },
    capabilities: {},
  };
}

describe("유틸", () => {
  it("parseRepo", () => {
    expect(parseRepo("darkpyonix/researchtree")).toEqual({ owner: "darkpyonix", name: "researchtree" });
    expect(parseRepo("nope")).toBeNull();
  });

  it("repoFromRemote", () => {
    expect(repoFromRemote("https://github.com/DarkPyonix/researchtree.git")).toBe("DarkPyonix/researchtree");
    expect(repoFromRemote("git@github.com:DarkPyonix/researchtree.git")).toBe("DarkPyonix/researchtree");
    expect(repoFromRemote("https://gitlab.com/a/b")).toBeNull();
  });

  it("nextPage는 api.github.com 경로만 돌려준다", () => {
    expect(nextPage('<https://api.github.com/repos/o/r/pulls?page=2>; rel="next", <https://api.github.com/repos/o/r/pulls?page=5>; rel="last"')).toBe("/repos/o/r/pulls?page=2");
    expect(nextPage('<https://evil.example/x>; rel="next"')).toBeNull();
    expect(nextPage(undefined)).toBeNull();
  });

  it("assertApiPath는 다른 도메인으로 가는 경로를 막는다", () => {
    expect(() => assertApiPath("/repos/o/r")).not.toThrow();
    for (const bad of ["repos/o/r", "//evil.com/x", "https://evil.com", "/\\evil"]) {
      expect(() => assertApiPath(bad)).toThrow();
    }
  });
});

describe("GitHubClient", () => {
  it("Link 헤더를 따라 페이지네이션한다", async () => {
    const host = fakeHost((req): GitHubResponse => {
      const page = Number(req.query?.page ?? 1);
      return {
        status: 200,
        headers: page === 1 ? { link: '<https://api.github.com/repos/o/r/pulls?state=all&page=2>; rel="next"' } : {},
        data: [{ n: page }],
      };
    });
    const out = await new GitHubClient(host).paginate<{ n: number }>({ method: "GET", path: "/repos/o/r/pulls" });
    expect(out).toEqual([{ n: 1 }, { n: 2 }]);
    expect(host.calls[1]).toMatchObject({ path: "/repos/o/r/pulls", query: { state: "all", page: "2" } });
  });

  it("304 응답이면 캐시를 쓴다", async () => {
    let n = 0;
    const host = fakeHost((req): GitHubResponse => {
      n++;
      if (req.etag === '"v1"') return { status: 304, headers: {}, data: null };
      return { status: 200, headers: { etag: '"v1"' }, data: { login: "me" } };
    });
    const gh = new GitHubClient(host);
    expect(await gh.user()).toEqual({ login: "me" });
    expect(await gh.user()).toEqual({ login: "me" });
    expect(n).toBe(2);
    expect(host.calls[1]!.etag).toBe('"v1"');
  });

  it("오류 응답은 HttpError로 던진다", async () => {
    const gh = new GitHubClient(fakeHost(() => ({ status: 401, headers: {}, data: { message: "Bad credentials" } })));
    await expect(gh.user()).rejects.toMatchObject({ status: 401 });
    await expect(gh.user()).rejects.toBeInstanceOf(HttpError);
  });

  it("branchExists는 404를 false로 돌려준다", async () => {
    const gh = new GitHubClient(fakeHost(() => ({ status: 404, headers: {}, data: {} })));
    expect(await gh.branchExists("o/r", "research")).toBe(false);
  });
});
