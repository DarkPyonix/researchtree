/** Root branch of the research tree. main/develop serve other purposes and are never the root. */
export const DEFAULT_ROOT = "research";

/** Experiment branch prefix. Only PR heads starting with it become tree nodes. */
export const DEFAULT_PREFIX = "experiment/";

export interface TreeConfig {
  root: string;
  prefix: string;
}

export const DEFAULT_TREE_CONFIG: TreeConfig = {
  root: DEFAULT_ROOT,
  prefix: DEFAULT_PREFIX,
};

const BRANCH_RE = /^(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._\-/]+$/;

/** The tree settings a repository's `.researchtree` asks for, filled in with the defaults. */
export function repoFileConfig(file: { root?: string; prefix?: string }): TreeConfig {
  return normalizeTreeConfig({ root: file.root, prefix: file.prefix }) ?? DEFAULT_TREE_CONFIG;
}

/**
 * Check a pair of branch names and fill in the defaults; the prefix always ends with `/`.
 * Null means the names cannot be used, and the caller falls back to the defaults.
 */
export function normalizeTreeConfig(input: { root?: string; prefix?: string }): TreeConfig | null {
  const root = (input.root ?? "").trim() || DEFAULT_ROOT;
  let prefix = (input.prefix ?? "").trim() || DEFAULT_PREFIX;
  if (!prefix.endsWith("/")) prefix += "/";
  if (!BRANCH_RE.test(root) || root.endsWith("/")) return null;
  if (!BRANCH_RE.test(prefix.slice(0, -1))) return null;
  // A root the prefix would swallow is not a root: every experiment would look like the trunk.
  if (root.startsWith(prefix)) return null;
  return { root, prefix };
}
