import { DEFAULT_TREE_CONFIG, type TreeConfig } from "./config";
import { parseBody } from "./prbody";
import type { PullRequest, ResearchTree, Status, TreeNode } from "./types";

function deriveStatus(pr: PullRequest, override: Status | undefined): Status {
  if (override) return override;
  if (pr.merged_at) return "adopted";
  if (pr.state === "closed") return "rejected";
  return "running";
}

function isResearchBranch(ref: string, config: TreeConfig): boolean {
  return ref === config.root || ref.startsWith(config.prefix);
}

function byCreatedAt(a: { createdAt: string }, b: { createdAt: string }): number {
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Build the research tree from a PR list. Rules follow docs/CONVENTIONS.md.
 * - Only PRs whose head is `experiment/*` become nodes.
 * - PRs whose base is not a research branch (research, experiment/*) are hidden unless YAML sets `parent`.
 * - When a branch has several PRs, the most recently created one wins.
 */
export function buildTree(
  prs: readonly PullRequest[],
  repo: string,
  config: TreeConfig = DEFAULT_TREE_CONFIG,
): ResearchTree {
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
    nodes.set(id, {
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
    });
  }

  // A node whose parent is not in the tree is marked orphan and attached to the root.
  for (const node of nodes.values()) {
    if (node.parent === config.root) continue;
    if (node.parent === node.id || !nodes.has(node.parent)) {
      node.orphan = true;
      node.warnings.push("orphan");
      node.parent = config.root;
    }
  }

  // Break parent cycles (A→B→A).
  for (const node of nodes.values()) {
    const seen = new Set<string>([node.id]);
    let cur = nodes.get(node.parent);
    while (cur) {
      if (seen.has(cur.id)) {
        node.warnings.push("cycle");
        node.orphan = true;
        node.parent = config.root;
        break;
      }
      seen.add(cur.id);
      cur = nodes.get(cur.parent);
    }
  }

  const rootChildren: TreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent === config.root) rootChildren.push(node);
    else nodes.get(node.parent)?.children.push(node.id);
  }

  const sortIds = (ids: string[]) =>
    ids.sort((a, b) => byCreatedAt(nodes.get(a)!.pr, nodes.get(b)!.pr));
  for (const node of nodes.values()) sortIds(node.children);
  rootChildren.sort((a, b) => byCreatedAt(a.pr, b.pr));

  const assignDepth = (id: string, depth: number) => {
    const node = nodes.get(id)!;
    node.depth = depth;
    for (const c of node.children) assignDepth(c, depth + 1);
  };
  for (const n of rootChildren) assignDepth(n.id, 1);

  return {
    repo,
    root: config.root,
    rootChildren: rootChildren.map((n) => n.id),
    nodes,
  };
}

/** Path from the root to the node (root excluded, node included). */
export function pathTo(tree: ResearchTree, id: string): string[] {
  const path: string[] = [];
  let cur = tree.nodes.get(id);
  while (cur) {
    path.unshift(cur.id);
    cur = tree.nodes.get(cur.parent);
  }
  return path;
}

/** Metrics of the parent node (undefined when the parent is the root). */
export function parentMetrics(tree: ResearchTree, id: string): Record<string, number | string> | undefined {
  const node = tree.nodes.get(id);
  if (!node) return undefined;
  return tree.nodes.get(node.parent)?.meta.metrics;
}

/** All metric keys in the tree, in order of first appearance. */
export function metricKeys(tree: ResearchTree): string[] {
  const keys: string[] = [];
  for (const node of tree.nodes.values()) {
    for (const k of Object.keys(node.meta.metrics ?? {})) if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** Branch name without the experiment prefix. */
export function shortName(id: string, config: TreeConfig = DEFAULT_TREE_CONFIG): string {
  return id.startsWith(config.prefix) ? id.slice(config.prefix.length) : id;
}
