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
