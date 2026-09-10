import { DEFAULT_TREE_CONFIG, type TreeConfig } from "./config";
import { parseBody } from "./prbody";
import type { PullActivity, PullRequest, ResearchTree, Season, Status, TreeNode, VersionNode, VersionTag } from "./types";

/** Research version names: `v1`, `v2`, `v1.1`, ... */
export const VERSION_RE = /^v\d+(?:\.\d+)*$/;

/**
 * Version tags are namespaced by the root branch (`research/v2`) so they never clash with release
 * tags such as `v2` on `main`. Returns the version name (`v2`) or null for any other tag.
 */
export function parseVersionTag(root: string, tag: string): string | null {
  const prefix = `${root}/`;
  if (!tag.startsWith(prefix)) return null;
  const name = tag.slice(prefix.length);
  return VERSION_RE.test(name) ? name : null;
}

/** Git tag for a version name: `research/v2`. */
export function versionTag(root: string, name: string): string {
  return `${root}/${name}`;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.slice(1).split(".").map(Number);
  const pb = b.slice(1).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function versionId(root: string, name: string): string {
  return `${root}@${name}`;
}

/** Northern-hemisphere season of a date: spring Mar–May, summer Jun–Aug, autumn Sep–Nov, winter Dec–Feb. */
export function seasonOf(iso: string): Season {
  const m = new Date(iso).getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

/** Accept `YYYY-MM-DD` or a full ISO timestamp from YAML; anything else is ignored. */
function yamlDate(v: unknown): string | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return undefined;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function deriveStatus(pr: PullRequest, override: Status | undefined): Status {
  if (override) return override;
  if (pr.merged_at) return "adopted";
  if (pr.state === "closed") return "rejected";
  return "running";
}

function isResearchBranch(ref: string, config: TreeConfig): boolean {
  return ref === config.root || ref.startsWith(config.prefix);
}

/**
 * Build the research tree from a PR list and the research version tags. Rules follow docs/CONVENTIONS.md.
 * - Only PRs whose head is `experiment/*` become nodes.
 * - PRs whose base is not a research branch (research, experiment/*) are hidden unless YAML sets `parent`.
 * - When a branch has several PRs, the most recently created one wins.
 * - With version tags, the first version is the root. An experiment that starts from research hangs off
 *   `research@vN` (YAML) or, if unspecified, the latest version tagged before its PR was opened.
 *   An adopted experiment merged into research produces the version whose commit is its merge commit,
 *   or else the first version tagged after the merge; that version then grows from it.
 */
export function buildTree(
  prs: readonly PullRequest[],
  repo: string,
  config: TreeConfig = DEFAULT_TREE_CONFIG,
  tags: readonly VersionTag[] = [],
  /** First/last commit dates per PR number (see GitHubClient.listPullActivity) */
  activity: ReadonlyMap<number, PullActivity> = new Map(),
): ResearchTree {
  const root = config.root;
  const sorted = tags
    .flatMap((t) => {
      const name = parseVersionTag(root, t.name);
      return name ? [{ ...t, name }] : [];
    })
    .sort((a, b) => compareVersions(a.name, b.name));
  const first = sorted[0];
  const versions = new Map<string, VersionNode>();
  for (const t of sorted.slice(1)) {
    const id = versionId(root, t.name);
    versions.set(id, { id, name: t.name, sha: t.sha, date: t.date, parent: root, mergedFrom: [], grownFrom: [], children: [], depth: 0 });
  }
  const byName = (name: string) => (first && name === first.name ? root : versions.has(versionId(root, name)) ? versionId(root, name) : null);
  /** Latest version tagged at or before `iso` (root when it is the first version or there are none). */
  const versionAt = (iso: string): { id: string; name: string | undefined } => {
    let pick: VersionTag | undefined = first;
    for (const t of sorted) if (t.date <= iso) pick = t;
    return { id: pick ? byName(pick.name) ?? root : root, name: pick?.name };
  };

  const chosen = new Map<string, { pr: PullRequest; parsed: ReturnType<typeof parseBody> }>();
  for (const pr of prs) {
    const head = pr.head.ref;
    if (!head.startsWith(config.prefix)) continue;
    const parsed = parseBody(pr.body);
    const visible = isResearchBranch(pr.base.ref, config) || Boolean(parsed.meta.parent);
    if (!visible) continue;
    const prev = chosen.get(head);
    if (!prev || pr.created_at > prev.pr.created_at) chosen.set(head, { pr, parsed });
  }

  const nodes = new Map<string, TreeNode>();
  for (const [id, { pr, parsed }] of chosen) {
    const act = activity.get(pr.number);
    const startedAt = yamlDate(parsed.meta.started) ?? act?.first ?? pr.created_at;
    const lastWorkAt = yamlDate(parsed.meta.ended) ?? act?.last ?? pr.merged_at ?? pr.closed_at ?? pr.updated_at;
    const node: TreeNode = {
      id,
      parent: parsed.meta.parent ?? pr.base.ref,
      pr: {
        number: pr.number,
        url: pr.html_url,
        title: pr.title,
        author: pr.user?.login ?? "unknown",
        authorAvatar: pr.user?.avatar_url,
        state: pr.state,
        merged: Boolean(pr.merged_at),
        draft: Boolean(pr.draft),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        closedAt: pr.closed_at,
        mergedAt: pr.merged_at,
        mergeSha: pr.merge_commit_sha ?? null,
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
      },
      status: deriveStatus(pr, parsed.meta.status),
      meta: parsed.meta,
      bodyMd: parsed.markdown,
      rawBody: pr.body ?? "",
      warnings: [...parsed.warnings],
      orphan: false,
      depth: 0,
      children: [],
      startedAt,
      lastWorkAt: lastWorkAt < startedAt ? startedAt : lastWorkAt,
    };

    // Resolve research-rooted parents onto a version.
    const at = node.parent.startsWith(`${root}@`) ? node.parent.slice(root.length + 1) : null;
    if (at !== null) {
      const vid = byName(at);
      node.version = at;
      if (vid) node.parent = vid;
      else {
        node.parent = root;
        node.warnings.push("unknown-version");
      }
    } else if (node.parent === root) {
      const v = versionAt(startedAt);
      node.parent = v.id;
      node.version = v.name;
    }
    nodes.set(id, node);
  }

  const exists = (id: string) => id === root || nodes.has(id) || versions.has(id);

  // A node whose parent is not in the tree is marked orphan and attached to the root.
  for (const node of nodes.values()) {
    if (node.parent === node.id || !exists(node.parent)) {
      node.orphan = true;
      node.warnings.push("orphan");
      node.parent = root;
    }
  }

  // Adopted experiments merged into research produce versions.
  const researchRooted = (n: TreeNode) => n.parent === root || versions.has(n.parent) || n.pr.baseRef === root;
  const ordered = [...versions.values()];
  for (const node of nodes.values()) {
    if (!node.pr.merged || !node.pr.mergedAt || !researchRooted(node)) continue;
    const mergedAt = node.pr.mergedAt;
    const v = ordered.find((x) => node.pr.mergeSha && x.sha === node.pr.mergeSha) ?? ordered.find((x) => x.date >= mergedAt);
    if (!v) continue;
    v.mergedFrom.push(node.id);
    node.produces = v.id;
  }

  const parentOf = (id: string): string | undefined => nodes.get(id)?.parent ?? versions.get(id)?.parent;
  const reaches = (from: string, target: string): boolean => {
    const seen = new Set<string>();
    for (let cur: string | undefined = from; cur && cur !== root; cur = parentOf(cur)) {
      if (cur === target) return true;
      if (seen.has(cur)) return true;
      seen.add(cur);
    }
    return false;
  };

  // The ends of an experiment's adopted chain: children merged into it (and theirs, and so on).
  // Its code holds every change down to those ends, so the next version grows from there.
  const byMergedAt = (a: string, b: string) => (nodes.get(a)!.pr.mergedAt ?? "").localeCompare(nodes.get(b)!.pr.mergedAt ?? "");
  const adoptedEnds = (id: string, seen: Set<string>): string[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const kids = [...nodes.values()].filter((n) => n.parent === id && n.pr.merged && n.pr.baseRef === id).map((n) => n.id).sort(byMergedAt);
    return kids.length ? kids.flatMap((k) => adoptedEnds(k, seen)) : [id];
  };

  // A version grows from the end of the last merged experiment's adopted chain, else from the previous version.
  ordered.forEach((v, i) => {
    const prev = i === 0 ? root : ordered[i - 1]!.id;
    v.mergedFrom.sort(byMergedAt);
    const seen = new Set<string>();
    v.grownFrom = v.mergedFrom.flatMap((id) => adoptedEnds(id, seen));
    const last = v.grownFrom[v.grownFrom.length - 1];
    v.parent = last && !reaches(last, v.id) ? last : prev;
  });

  // Break parent cycles among experiments (A→B→A).
  for (const node of nodes.values()) {
    if (reaches(node.parent, node.id)) {
      node.warnings.push("cycle");
      node.orphan = true;
      node.parent = root;
    }
  }

  const timeOf = (id: string) => nodes.get(id)?.startedAt ?? versions.get(id)?.date ?? "";
  const rootChildren: string[] = [];
  const attach = (id: string, parent: string) => {
    if (parent === root) rootChildren.push(id);
    else (nodes.get(parent) ?? versions.get(parent))?.children.push(id);
  };
  for (const node of nodes.values()) attach(node.id, node.parent);
  for (const v of versions.values()) attach(v.id, v.parent);

  const byTime = (a: string, b: string) => timeOf(a).localeCompare(timeOf(b));
  for (const n of nodes.values()) n.children.sort(byTime);
  for (const v of versions.values()) v.children.sort(byTime);
  rootChildren.sort(byTime);

  const assignDepth = (id: string, depth: number) => {
    const n = nodes.get(id) ?? versions.get(id);
    if (!n) return;
    n.depth = depth;
    for (const c of n.children) assignDepth(c, depth + 1);
  };
  for (const id of rootChildren) assignDepth(id, 1);

  return { repo, root, prefix: config.prefix, rootVersion: first?.name ?? null, rootChildren, nodes, versions };
}

/** Parent ID of an experiment or version (undefined for the root). */
export function parentOf(tree: ResearchTree, id: string): string | undefined {
  return tree.nodes.get(id)?.parent ?? tree.versions.get(id)?.parent;
}

/** Child IDs of the root, an experiment, or a version. */
export function childrenOf(tree: ResearchTree, id: string): string[] {
  if (id === tree.root) return tree.rootChildren;
  return tree.nodes.get(id)?.children ?? tree.versions.get(id)?.children ?? [];
}

/** Path from the root to the node (root excluded, node included). Versions on the way are included. */
export function pathTo(tree: ResearchTree, id: string): string[] {
  const path: string[] = [];
  for (let cur: string | undefined = id; cur && cur !== tree.root; cur = parentOf(tree, cur)) {
    if (path.includes(cur)) break;
    path.unshift(cur);
  }
  return path;
}

/** Metrics a version stands for: those of the experiment it grows from (the end of the last merged chain). */
export function versionMetrics(tree: ResearchTree, versionIdOrName: string): Record<string, number | string> | undefined {
  const v = tree.versions.get(versionIdOrName);
  const from = v?.grownFrom[v.grownFrom.length - 1] ?? v?.mergedFrom[v.mergedFrom.length - 1];
  return from ? tree.nodes.get(from)?.meta.metrics : undefined;
}

/** Metrics of the parent node (a version counts as its last merged experiment; undefined at the root). */
export function parentMetrics(tree: ResearchTree, id: string): Record<string, number | string> | undefined {
  const parent = parentOf(tree, id);
  if (!parent) return undefined;
  return tree.nodes.get(parent)?.meta.metrics ?? versionMetrics(tree, parent);
}

/** All metric keys in the tree, in order of first appearance. */
export function metricKeys(tree: ResearchTree): string[] {
  const keys: string[] = [];
  for (const node of tree.nodes.values()) {
    for (const k of Object.keys(node.meta.metrics ?? {})) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** Short label for a node of this tree: experiment branch without its prefix, `v2` for versions. */
export function displayName(tree: Pick<ResearchTree, "root" | "prefix">, id: string): string {
  return shortName(id, { root: tree.root, prefix: tree.prefix });
}

/** Experiment branch without its prefix, `v2` for versions. */
export function shortName(id: string, config: TreeConfig = DEFAULT_TREE_CONFIG): string {
  if (id.startsWith(`${config.root}@`)) return id.slice(config.root.length + 1);
  return id.startsWith(config.prefix) ? id.slice(config.prefix.length) : id;
}
