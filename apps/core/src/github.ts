import { HttpError, type GitHubRequest, type GitHubResponse, type Host } from "./host";
import { parseVersionTag } from "./tree";
import type { Commit, GitHubUser, PullActivity, PullComment, PullFile, PullRequest, VersionTag } from "./types";

const API = "https://api.github.com";

export interface RepoRef {
  owner: string;
  name: string;
}

export function parseRepo(s: string): RepoRef | null {
  const m = /^\s*([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\s*$/.exec(s);
  if (!m) return null;
  return { owner: m[1]!, name: m[2]! };
}

/** Extract owner/name from a git remote URL (https or ssh). */
export function repoFromRemote(url: string): string | null {
  const m = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Extract the rel="next" path from a Link header. */
export function nextPage(link: string | undefined): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) {
      const url = m[1]!;
      return url.startsWith(API) ? url.slice(API.length) : null;
    }
  }
  return null;
}

function splitPathQuery(pathWithQuery: string): Pick<GitHubRequest, "path" | "query"> {
  const i = pathWithQuery.indexOf("?");
  if (i < 0) return { path: pathWithQuery };
  const query: Record<string, string> = {};
  new URLSearchParams(pathWithQuery.slice(i + 1)).forEach((v, k) => (query[k] = v));
  return { path: pathWithQuery.slice(0, i), query };
}

function errorMessage(res: GitHubResponse): string {
  const d = res.data as { message?: string } | undefined;
  return d?.message ? `GitHub API ${res.status}: ${d.message}` : `GitHub API ${res.status}`;
}

/** GitHub REST client on top of Host.request. GET responses are cached by ETag. */
export class GitHubClient {
  private cache = new Map<string, { etag: string; data: unknown; headers: Record<string, string> }>();

  constructor(private readonly host: Host) {}

  async call<T>(req: GitHubRequest): Promise<{ data: T; headers: Record<string, string> }> {
    const key = req.method === "GET" ? req.path + JSON.stringify(req.query ?? {}) : null;
    const cached = key ? this.cache.get(key) : undefined;
    const res = await this.host.request({ ...req, etag: cached?.etag });

    if (res.status === 304 && cached) return { data: cached.data as T, headers: cached.headers };
    if (res.status < 200 || res.status >= 300) throw new HttpError(res.status, errorMessage(res), res.data);

    const etag = res.headers["etag"];
    if (key && etag) this.cache.set(key, { etag, data: res.data, headers: res.headers });
    // Writes invalidate cached reads; GraphQL queries are reads even though they are POSTs.
    if (req.method !== "GET" && req.path !== "/graphql") this.cache.clear();
    return { data: res.data as T, headers: res.headers };
  }

  async paginate<T>(req: GitHubRequest, limit = 20): Promise<T[]> {
    const out: T[] = [];
    let cur: GitHubRequest | null = req;
    for (let page = 0; cur && page < limit; page++) {
      const { data, headers }: { data: T[]; headers: Record<string, string> } = await this.call<T[]>(cur);
      out.push(...data);
      const next = nextPage(headers["link"]);
      cur = next ? { method: "GET", ...splitPathQuery(next) } : null;
    }
    return out;
  }

  invalidate(): void {
    this.cache.clear();
  }

  user(): Promise<GitHubUser> {
    return this.call<GitHubUser>({ method: "GET", path: "/user" }).then((r) => r.data);
  }

  listPulls(repo: string): Promise<PullRequest[]> {
    return this.paginate<PullRequest>({
      method: "GET",
      path: `/repos/${repo}/pulls`,
      query: { state: "all", per_page: 100, sort: "created", direction: "asc" },
    });
  }

  /** Research version tags of a root branch (`research/v1`, `research/v2`, ...) with each tagged commit's date. */
  async listVersionTags(repo: string, root: string): Promise<VersionTag[]> {
    const tags = await this.paginate<{ name: string; commit: { sha: string } }>({
      method: "GET",
      path: `/repos/${repo}/tags`,
      query: { per_page: 100 },
    });
    const versions = tags.filter((t) => parseVersionTag(root, t.name) !== null);
    return Promise.all(
      versions.map(async (t) => {
        const c = await this.call<{ commit: { committer: { date: string } | null; author: { date: string } | null } }>({
          method: "GET",
          path: `/repos/${repo}/commits/${t.commit.sha}`,
        });
        const date = c.data.commit.committer?.date ?? c.data.commit.author?.date ?? "";
        return { name: t.name, sha: t.commit.sha, date };
      }),
    );
  }

  /** First commit (authored) and last commit (committed) date of every PR's branch, via one GraphQL query per 100 PRs. */
  async listPullActivity(repo: string): Promise<Map<number, PullActivity>> {
    const [owner, name] = repo.split("/");
    const query = `query($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        pullRequests(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            number
            first: commits(first: 1) { nodes { commit { authoredDate } } }
            last: commits(last: 1) { nodes { commit { committedDate } } }
          }
        }
      }
    }`;
    type Page = {
      data?: {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
            nodes: {
              number: number;
              first: { nodes: { commit: { authoredDate: string } }[] };
              last: { nodes: { commit: { committedDate: string } }[] };
            }[];
          };
        } | null;
      };
      errors?: { message: string }[];
    };
    const out = new Map<number, PullActivity>();
    let cursor: string | null = null;
    for (let page = 0; page < 20; page++) {
      const res: { data: Page } = await this.call<Page>({ method: "POST", path: "/graphql", body: { query, variables: { owner, name, cursor } } });
      const body: Page = res.data;
      if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors[0]!.message}`);
      const prs: NonNullable<NonNullable<Page["data"]>["repository"]>["pullRequests"] | undefined = body.data?.repository?.pullRequests;
      if (!prs) break;
      for (const n of prs.nodes) {
        out.set(n.number, { first: n.first.nodes[0]?.commit.authoredDate, last: n.last.nodes[0]?.commit.committedDate });
      }
      if (!prs.pageInfo.hasNextPage) break;
      cursor = prs.pageInfo.endCursor;
    }
    return out;
  }

  listCommits(repo: string, number: number): Promise<Commit[]> {
    return this.paginate<Commit>({ method: "GET", path: `/repos/${repo}/pulls/${number}/commits`, query: { per_page: 100 } }, 3);
  }

  /** Conversation comments and inline review comments of a PR, oldest first. */
  async listPullComments(repo: string, number: number): Promise<PullComment[]> {
    const [issue, review] = await Promise.all([
      this.paginate<PullComment>({ method: "GET", path: `/repos/${repo}/issues/${number}/comments`, query: { per_page: 100 } }, 5),
      this.paginate<PullComment>({ method: "GET", path: `/repos/${repo}/pulls/${number}/comments`, query: { per_page: 100 } }, 5),
    ]);
    return [...issue, ...review].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  addPullComment(repo: string, number: number, body: string): Promise<PullComment> {
    return this.call<PullComment>({ method: "POST", path: `/repos/${repo}/issues/${number}/comments`, body: { body } }).then((r) => r.data);
  }

  /** "Files changed" of a PR (GitHub lists at most 3000 files). */
  listPullFiles(repo: string, number: number): Promise<PullFile[]> {
    return this.paginate<PullFile>({ method: "GET", path: `/repos/${repo}/pulls/${number}/files`, query: { per_page: 100 } }, 30);
  }

  updatePullBody(repo: string, number: number, body: string): Promise<PullRequest> {
    return this.call<PullRequest>({ method: "PATCH", path: `/repos/${repo}/pulls/${number}`, body: { body } }).then((r) => r.data);
  }

  getPull(repo: string, number: number): Promise<PullRequest> {
    return this.call<PullRequest>({ method: "GET", path: `/repos/${repo}/pulls/${number}` }).then((r) => r.data);
  }

  /** A text file at a branch, tag or commit; null when it does not exist there (or is not a file). */
  async getFileText(repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const res = await this.call<{ type?: string; encoding?: string; content?: string }>({
        method: "GET",
        path: `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
        query: { ref },
      });
      const d = res.data;
      if (d.type !== "file" || d.encoding !== "base64" || typeof d.content !== "string") return null;
      const bin = atob(d.content.replace(/\s/g, ""));
      return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }

  /** The commit where `head` forked from `base` (both may be SHAs). */
  async mergeBase(repo: string, base: string, head: string): Promise<string> {
    const res = await this.call<{ merge_base_commit: { sha: string } }>({
      method: "GET",
      path: `/repos/${repo}/compare/${base}...${head}`,
      query: { per_page: 1 },
    });
    return res.data.merge_base_commit.sha;
  }

  /**
   * What the repository says about itself: its one-line description and its default branch, which is
   * where `.researchtree.yml` lives. Never throws: the viewer works without either.
   */
  async repoInfo(repo: string): Promise<{ description: string | null; defaultBranch: string | null }> {
    try {
      const res = await this.call<{ description?: string | null; default_branch?: string }>({ method: "GET", path: `/repos/${repo}` });
      return { description: res.data.description?.trim() || null, defaultBranch: res.data.default_branch ?? null };
    } catch {
      return { description: null, defaultBranch: null };
    }
  }

  async branchExists(repo: string, branch: string): Promise<boolean> {
    try {
      await this.call({ method: "GET", path: `/repos/${repo}/branches/${encodeURIComponent(branch)}` });
      return true;
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return false;
      throw e;
    }
  }

  listUserRepos(): Promise<{ full_name: string; private: boolean; pushed_at: string }[]> {
    return this.call<{ full_name: string; private: boolean; pushed_at: string }[]>({
      method: "GET",
      path: "/user/repos",
      query: { sort: "pushed", per_page: 50, affiliation: "owner,collaborator,organization_member" },
    }).then((r) => r.data);
  }

  /** Branch `experiment/<name>` off its parent and open a draft PR. */
  async createExperiment(repo: string, opts: { branch: string; parent: string; title: string; body: string }): Promise<PullRequest> {
    const ref = await this.call<{ object: { sha: string } }>({
      method: "GET",
      path: `/repos/${repo}/git/ref/heads/${opts.parent}`,
    });
    await this.call({
      method: "POST",
      path: `/repos/${repo}/git/refs`,
      body: { ref: `refs/heads/${opts.branch}`, sha: ref.data.object.sha },
    });
    const pr = await this.call<PullRequest>({
      method: "POST",
      path: `/repos/${repo}/pulls`,
      body: { title: opts.title, head: opts.branch, base: opts.parent, body: opts.body, draft: true },
    });
    return pr.data;
  }

  closePull(repo: string, number: number): Promise<PullRequest> {
    return this.call<PullRequest>({ method: "PATCH", path: `/repos/${repo}/pulls/${number}`, body: { state: "closed" } }).then((r) => r.data);
  }

  async mergePull(repo: string, number: number): Promise<void> {
    await this.call({ method: "PUT", path: `/repos/${repo}/pulls/${number}/merge`, body: { merge_method: "merge" } });
  }
}
