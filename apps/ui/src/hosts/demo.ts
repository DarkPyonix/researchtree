import type { GitHubRequest, GitHubResponse, Host, PullRequest } from "@researchtree/core";
import demoPrs from "./demo-prs.json";
import { openInNewTab } from "../host-utils";

export const DEMO_REPO = "darkpyonix/moshi-research-demo";

const USER = { login: "demo", avatar_url: "", name: "Demo" };

function ok(data: unknown, status = 200): GitHubResponse {
  return { status, headers: {}, data };
}

function fakeCommits(pr: PullRequest) {
  const base = new Date(pr.created_at).getTime();
  const msgs = ["실험 설정 추가", "학습 스크립트 인자 조정", "평가 결과 반영"];
  return msgs.slice(0, 2 + (pr.number % 2)).map((m, i) => ({
    sha: `${i}${pr.head.sha}`.padEnd(40, "0"),
    html_url: `${pr.html_url}/commits`,
    commit: { message: m, author: { name: pr.user?.login ?? "demo", date: new Date(base + i * 36e5 * 7).toISOString() } },
  }));
}

/** Host backed by fake PR data, for trying the viewer or presenting without sign-in. Edits are lost on reload. */
export function createDemoHost(): Host {
  const prs: PullRequest[] = structuredClone(demoPrs as PullRequest[]);
  const mem = new Map<string, unknown>();

  return {
    kind: "demo",
    storage: {
      get: <T>(k: string) => mem.get(k) as T | undefined,
      set: (k, v) => void mem.set(k, v),
    },
    auth: {
      current: async () => USER,
      signIn: async () => USER,
      signOut: async () => {},
      availability: () => ({ ok: true }),
    },
    async request(req: GitHubRequest): Promise<GitHubResponse> {
      await new Promise((r) => setTimeout(r, 120));
      const p = req.path;
      if (p === "/user") return ok(USER);
      if (p === "/user/repos") return ok([{ full_name: DEMO_REPO, private: false, pushed_at: "2026-09-09T00:00:00Z" }]);

      const m = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(p);
      if (!m || m[1] !== DEMO_REPO) return ok({ message: "Not Found" }, 404);
      const rest = m[2] ?? "";

      if (rest === "/pulls" && req.method === "GET") return ok(prs);
      if (rest.startsWith("/branches/")) return ok({ name: decodeURIComponent(rest.slice(10)) });

      const pm = /^\/pulls\/(\d+)(\/commits)?$/.exec(rest);
      const pr = pm ? prs.find((x) => x.number === Number(pm[1])) : undefined;
      if (pm && pr) {
        if (pm[2]) return ok(fakeCommits(pr));
        if (req.method === "GET") return ok(pr);
        if (req.method === "PATCH") {
          const body = req.body as { body?: string; state?: "open" | "closed" };
          if (body.body !== undefined) pr.body = body.body;
          if (body.state) {
            pr.state = body.state;
            pr.closed_at = body.state === "closed" ? new Date().toISOString() : null;
          }
          pr.updated_at = new Date().toISOString();
          return ok(pr);
        }
      }
      return ok({ message: "Not Found" }, 404);
    },
    initialRepo: async () => DEMO_REPO,
    openExternal: openInNewTab,
    capabilities: {},
  };
}
