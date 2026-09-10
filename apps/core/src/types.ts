export type Status = "running" | "adopted" | "rejected";

export const STATUSES: readonly Status[] = ["running", "adopted", "rejected"];

/** Subset of the GitHub REST `pulls` response used by ResearchTree. */
export interface PullRequest {
  number: number;
  html_url: string;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  body: string | null;
  user: { login: string; avatar_url?: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
}

export interface Commit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

export interface GitHubUser {
  login: string;
  avatar_url: string;
  name?: string | null;
}

export type MetricValue = number | string;

/** YAML block at the top of the PR body. Unknown fields are preserved. */
export interface ExperimentMeta {
  parent?: string;
  hypothesis?: string;
  change?: string;
  metrics?: Record<string, MetricValue>;
  wandb?: string;
  status?: Status;
  tags?: string[];
  [key: string]: unknown;
}

export type NodeWarning =
  | "no-yaml-block"
  | "yaml-parse-error"
  | "missing-hypothesis"
  | "invalid-status"
  | "invalid-field"
  | "orphan"
  | "cycle";

export interface TreeNode {
  /** Head branch name, used as the node ID */
  id: string;
  parent: string;
  pr: {
    number: number;
    url: string;
    title: string;
    author: string;
    authorAvatar?: string;
    state: "open" | "closed";
    merged: boolean;
    draft: boolean;
    createdAt: string;
    updatedAt: string;
    closedAt: string | null;
    headSha: string;
    baseRef: string;
  };
  status: Status;
  meta: ExperimentMeta;
  /** Markdown without the YAML block */
  bodyMd: string;
  /** Raw PR body (used for lossless rewrites when editing) */
  rawBody: string;
  warnings: NodeWarning[];
  orphan: boolean;
  depth: number;
  children: string[];
}

export interface ResearchTree {
  repo: string;
  root: string;
  /** IDs of the root's direct children */
  rootChildren: string[];
  nodes: Map<string, TreeNode>;
}
