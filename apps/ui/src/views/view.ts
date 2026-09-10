import type { ResearchTree, Status } from "@researchtree/core";

export interface ViewFilter {
  hidden: ReadonlySet<Status>;
  /** Label metric per island (root or version id); null shows no metric. */
  metrics: ReadonlyMap<string, string | null>;
}

export interface ViewOptions {
  onSelect(id: string | null): void;
  /** Areas covering the canvas, such as the side panel and bottom bar (px) */
  insets(): { top: number; right: number; bottom: number; left: number };
  /** Date (ms) on the time axis under the middle of the viewport; null without a time axis. */
  onTime?(ms: number | null): void;
}

/** Common surface of the 2D and 3D tree views, so the app can swap them freely. */
export interface TreeViewApi {
  /** Top-level element of the view inside the canvas (used for cross-fades). */
  readonly element: Element;
  render(tree: ResearchTree, filter: ViewFilter): void;
  select(id: string | null, focus?: boolean): void;
  /** Fit the given nodes (or all nodes) into the viewport. */
  fit(ids?: readonly string[], animate?: boolean): void;
  focusNode(id: string): void;
  destroy(): void;
}

/** Width of one time-axis column in layout units (a typical parent -> child gap). */
export const LAYOUT_COL = 310;
