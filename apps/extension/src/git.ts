import * as vscode from "vscode";
import { repoFromRemote, t, type GitHubRequest, type GitHubResponse } from "@researchtree/core";

/* Subset of the built-in Git extension API used here (vscode/extensions/git/src/api/git.d.ts). */
interface Remote {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}
interface Ref {
  type: number;
  name?: string;
  commit?: string;
  remote?: string;
}
interface Branch extends Ref {
  upstream?: { name: string; remote: string };
}
interface RepositoryState {
  HEAD: Branch | undefined;
  remotes: Remote[];
  refs?: Ref[];
  onDidChange: vscode.Event<void>;
}
interface Repository {
  rootUri: vscode.Uri;
  state: RepositoryState;
  fetch(remote?: string, ref?: string, depth?: number): Promise<void>;
  checkout(treeish: string): Promise<void>;
  createBranch(name: string, checkout: boolean, ref?: string): Promise<void>;
  getBranch(name: string): Promise<Branch>;
  setBranchUpstream?(name: string, upstream: string): Promise<void>;
  getRefs?(query?: { pattern?: string }): Promise<Ref[]>;
  getMergeBase?(ref1: string, ref2: string): Promise<string | undefined>;
}
interface GitAPI {
  state: "uninitialized" | "initialized";
  onDidChangeState: vscode.Event<"uninitialized" | "initialized">;
  repositories: Repository[];
  toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
}
interface GitExtension {
  getAPI(version: 1): GitAPI;
}

async function gitApi(): Promise<GitAPI | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!ext) return undefined;
  const exports = ext.isActive ? ext.exports : await ext.activate();
  const api = exports.getAPI(1);
  if (api.state !== "initialized") {
    // Wait briefly for repository discovery to finish.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      const sub = api.onDidChangeState((s) => {
        if (s === "initialized") {
          clearTimeout(timer);
          sub.dispose();
          resolve();
        }
      });
    });
  }
  return api;
}

/** Encodes a branch name but keeps its `/` separators. */
const enc = (b: string) => b.split("/").map(encodeURIComponent).join("/");

function originRepo(repo: Repository): string | null {
  const origin = repo.state.remotes.find((r) => r.name === "origin");
  const url = origin?.fetchUrl ?? origin?.pushUrl;
  return url ? repoFromRemote(url) : null;
}

/** Works with the workspace git repositories. The chosen repository is remembered for the session. */
export class GitBridge {
  private chosen: Repository | undefined;

  constructor(private readonly request: (req: GitHubRequest) => Promise<GitHubResponse>) {}

  /** Repositories whose `origin` is on GitHub. */
  async candidates(): Promise<{ repo: Repository; slug: string }[]> {
    const api = await gitApi();
    if (!api) return [];
    const out: { repo: Repository; slug: string }[] = [];
    for (const repo of api.repositories) {
      const slug = originRepo(repo);
      if (slug) out.push({ repo, slug });
    }
    return out;
  }

  private picking: Promise<{ repo: Repository; slug: string } | null> | undefined;

  /** Chooses the repository to show, asking with a QuickPick if there are several. Concurrent calls share one prompt. */
  pick(): Promise<{ repo: Repository; slug: string } | null> {
    this.picking ??= this.doPick().finally(() => (this.picking = undefined));
    return this.picking;
  }

  private async doPick(): Promise<{ repo: Repository; slug: string } | null> {
    const list = await this.candidates();
    if (this.chosen) {
      const hit = list.find((c) => c.repo === this.chosen);
      if (hit) return hit;
    }
    let found = list[0];
    if (list.length > 1) {
      const item = await vscode.window.showQuickPick(
        list.map((c) => ({ label: c.slug, description: vscode.workspace.asRelativePath(c.repo.rootUri), c })),
        { placeHolder: t("ext.pickRepo") },
      );
      found = item?.c;
    }
    if (!found) return null;
    this.chosen = found.repo;
    return found;
  }

  async initialRepo(): Promise<string | null> {
    return (await this.pick())?.slug ?? null;
  }

  async currentBranch(): Promise<string | null> {
    return (await this.pick())?.repo.state.HEAD?.name ?? null;
  }

  /** Notifies when HEAD changes. */
  async onBranchChange(cb: (branch: string | null) => void): Promise<vscode.Disposable | undefined> {
    const picked = await this.pick();
    if (!picked) return undefined;
    let last = picked.repo.state.HEAD?.name ?? null;
    return picked.repo.state.onDidChange(() => {
      const now = picked.repo.state.HEAD?.name ?? null;
      if (now !== last) cb((last = now));
    });
  }

  private async require(): Promise<{ repo: Repository; slug: string }> {
    const picked = await this.pick();
    if (!picked) throw new Error(t("ext.noRepo"));
    return picked;
  }

  async checkout(branch: string): Promise<void> {
    try {
      const { repo } = await this.require();
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t("ext.switching", { branch }) },
        async () => {
          await repo.fetch("origin", branch).catch(() => repo.fetch("origin"));
          const local = await repo.getBranch(branch).catch(() => undefined);
          if (local) {
            await repo.checkout(branch);
          } else {
            // Remote-only branch: create a local tracking branch and switch to it.
            await repo.createBranch(branch, true, `origin/${branch}`);
            await repo.setBranchUpstream?.(branch, `origin/${branch}`).catch(() => {});
          }
        },
      );
      void vscode.window.showInformationMessage(t("ext.switched", { branch }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void vscode.window.showErrorMessage(t("ext.checkoutFailed", { branch, error: msg }));
      throw e;
    }
  }

  private async hasRef(repo: Repository, name: string): Promise<boolean> {
    const refs = (await repo.getRefs?.({ pattern: `refs/remotes/${name}` }).catch(() => undefined)) ?? repo.state.refs ?? [];
    return refs.some((r) => r.name === name);
  }

  async openDiff(base: string, head: string): Promise<void> {
    const { repo, slug } = await this.require();
    const compareUrl = `https://github.com/${slug}/compare/${enc(base)}...${enc(head)}`;

    const res = await this.request({
      method: "GET",
      path: `/repos/${slug}/compare/${enc(base)}...${enc(head)}`,
    });
    if (res.status !== 200) {
      void vscode.window.showErrorMessage(t("ext.compareFailed", { status: res.status }));
      return;
    }
    const files = ((res.data as { files?: { filename: string; status: string; previous_filename?: string }[] }).files ?? []);
    if (files.length === 0) {
      void vscode.window.showInformationMessage(t("ext.noChanges", { base, head }));
      return;
    }
    const item = await vscode.window.showQuickPick(
      files.map((f) => ({ label: f.filename, description: f.status, f })),
      { placeHolder: t("ext.changedFiles", { head, base, n: files.length }), matchOnDescription: true },
    );
    if (!item) return;

    const api = await gitApi();
    await repo.fetch("origin").catch(() => {});
    const baseRef = `origin/${base}`;
    const headRef = `origin/${head}`;
    if (!api || !(await this.hasRef(repo, baseRef)) || !(await this.hasRef(repo, headRef))) {
      void vscode.window.showWarningMessage(t("ext.openCompare"));
      await vscode.env.openExternal(vscode.Uri.parse(compareUrl));
      return;
    }
    // Diff from the merge base, like GitHub's base...head compare.
    const left = (await repo.getMergeBase?.(baseRef, headRef).catch(() => undefined)) ?? baseRef;
    const f = item.f;
    const leftUri = api.toGitUri(vscode.Uri.joinPath(repo.rootUri, f.previous_filename ?? f.filename), left);
    const rightUri = api.toGitUri(vscode.Uri.joinPath(repo.rootUri, f.filename), headRef);
    await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, `${f.filename} (${base} ↔ ${head})`);
  }
}
