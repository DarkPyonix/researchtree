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
  merge_commit_sha?: string | null;
}

/** First and last commit dates of a PR's branch (ISO 8601). */
export interface PullActivity {
  first?: string;
  last?: string;
}

export type Season = "spring" | "summer" | "autumn" | "winter";

/** A git tag as listed by GitHub; research versions are `<root>/vN` (see parseVersionTag). */
export interface VersionTag {
  name: string;
  sha: string;
  /** Commit date of the tagged commit (ISO 8601) */
  date: string;
}

export interface Commit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

/** A PR conversation comment, or an inline review comment (then `path` is set). */
export interface PullComment {
  id: number;
  html_url: string;
  body: string;
  created_at: string;
  user: { login: string; avatar_url?: string } | null;
  path?: string;
  line?: number | null;
}

/** One file of a PR's "Files changed". `patch` is missing for binary or very large diffs. */
export interface PullFile {
  filename: string;
  previous_filename?: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch?: string;
  blob_url: string;
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
  | "cycle"
  | "unknown-version";

export interface TreeNode {
  /** Head branch name, used as the node ID */
  id: string;
  /** Parent node ID: another experiment, a version node (`research@v2`), or the root (`research` = first version) */
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
    mergedAt: string | null;
    mergeSha: string | null;
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
  /** Child IDs: experiments, and the version this experiment produced (if any) */
  children: string[];
  /** When the experiment started: YAML `started`, else its first commit, else PR creation (ISO 8601) */
  startedAt: string;
  /** Last work on the branch: YAML `ended`, else its last commit, else PR close/update (ISO 8601) */
  lastWorkAt: string;
  /** Research version this experiment started from (only for experiments that branch off research) */
  version?: string;
  /** Version node this adopted experiment was merged into */
  produces?: string;
}

/** A research version after the first one. The first version is the tree root itself. */
export interface VersionNode {
  /** `research@v2` */
  id: string;
  /** `v2` */
  name: string;
  sha: string;
  date: string;
  /** Node it grows from: the last adopted experiment merged into it, or the previous version / root */
  parent: string;
  /** Adopted experiments merged into research for this version */
  mergedFrom: string[];
  /** Ends of the adopted chains under `mergedFrom` (oldest first); the version grows from the last one */
  grownFrom: string[];
  children: string[];
  depth: number;
}

export interface ResearchTree {
  repo: string;
  root: string;
  /** Experiment branch prefix this tree was built with (e.g. `experiment/`) */
  prefix: string;
  /** Name of the first research version (the root), or null when the repo has no version tags */
  rootVersion: string | null;
  /** IDs of the root's direct children */
  rootChildren: string[];
  nodes: Map<string, TreeNode>;
  versions: Map<string, VersionNode>;
}
