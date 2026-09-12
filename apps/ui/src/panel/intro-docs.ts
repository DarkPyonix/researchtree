/**
 * The documents behind the research intro reef (docs/ISLAND.md).
 *
 * The overview and the goals come from the root branch, because they describe the research as a
 * whole. The intent and the spec come from the newest version, because those move with the research.
 * Whatever is missing simply has no tab.
 */
import { DEFAULT_INTENT_PATH, DEFAULT_SPEC_PATH, type GitHubClient, type ResearchTree } from "@researchtree/core";
import { orderedVersions, versionRef } from "./spec-view";

export interface IntroDoc {
  key: string;
  /** i18n key for the tab label. */
  label: string;
  path: string;
  /** Branch or tag the text was read from, for the line above the document. */
  ref: string;
  text: string;
}

export interface IntroDocs {
  entries: IntroDoc[];
  /** Set when GitHub could not be reached at all; a missing file is not an error. */
  error?: string;
}

/** The newest version's tag, or the root branch when the research has no versions yet. */
function latestRef(tree: ResearchTree): string {
  const versions = orderedVersions(tree);
  const last = versions[versions.length - 1];
  return last ? versionRef(tree, last) : tree.root;
}

export async function loadIntroDocs(
  gh: GitHubClient,
  tree: ResearchTree,
  paths: { spec: string; intent: string },
): Promise<IntroDocs> {
  const root = tree.root;
  const ref = latestRef(tree);
  const wanted: { key: string; label: string; path: string; ref: string }[] = [
    { key: "overview", label: "intro.overview", path: "README.md", ref: root },
    { key: "project", label: "intro.project", path: "PROJECT.md", ref: root },
    { key: "research", label: "intro.research", path: "RESEARCH.md", ref: root },
    { key: "intent", label: "intro.intent", path: paths.intent || DEFAULT_INTENT_PATH, ref },
    { key: "spec", label: "intro.spec", path: paths.spec || DEFAULT_SPEC_PATH, ref },
  ];

  try {
    const texts = await Promise.all(wanted.map((w) => gh.getFileText(tree.repo, w.path, w.ref)));
    return { entries: wanted.flatMap((w, i) => (texts[i]?.trim() ? [{ ...w, text: texts[i]! }] : [])) };
  } catch (e) {
    return { entries: [], error: e instanceof Error ? e.message : String(e) };
  }
}
