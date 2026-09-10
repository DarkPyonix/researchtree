import { t } from "./i18n";

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

/** Validate and normalize user-entered branch settings. The prefix always ends with `/`. */
export function normalizeTreeConfig(input: { root?: string; prefix?: string }): TreeConfig | { error: string } {
  const root = (input.root ?? "").trim() || DEFAULT_ROOT;
  let prefix = (input.prefix ?? "").trim() || DEFAULT_PREFIX;
  if (!prefix.endsWith("/")) prefix += "/";
  if (!BRANCH_RE.test(root) || root.endsWith("/")) return { error: t("config.invalidRoot") };
  if (!BRANCH_RE.test(prefix.slice(0, -1))) return { error: t("config.invalidPrefix") };
  if (root.startsWith(prefix)) return { error: t("config.rootInPrefix") };
  return { root, prefix };
}
