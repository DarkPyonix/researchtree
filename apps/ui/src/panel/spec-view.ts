import {
  diffSpecs,
  lineDiff,
  loadSpec,
  sectionHistory,
  t,
  versionTag,
  type GitHubClient,
  type ResearchTree,
  type SectionChange,
  type SectionChangeKind,
  type Spec,
  type SpecSection,
  type TreeNode,
  type VersionNode,
} from "@researchtree/core";
import { clear, h, icon } from "../dom";
import { renderMarkdown } from "../markdown";
import { rootVersion } from "../views/layout";

/** Git ref a version's files are read at: its tag, or the root branch when the repo has no tags. */
export function versionRef(tree: ResearchTree, v: VersionNode): string {
  if (v.id === tree.root) return tree.rootVersion ? versionTag(tree.root, tree.rootVersion) : tree.root;
  return versionTag(tree.root, v.name);
}

/** Every version oldest first; the root stands for the first one. */
export function orderedVersions(tree: ResearchTree): VersionNode[] {
  return [rootVersion(tree), ...[...tree.versions.values()].sort((a, b) => a.date.localeCompare(b.date))];
}

/** Spec documents of one repo, read from GitHub once per ref. */
export class SpecStore {
  private readonly cache = new Map<string, Promise<Spec | null>>();

  constructor(
    private readonly gh: GitHubClient,
    readonly repo: string,
    readonly path: string,
  ) {}

  at(ref: string): Promise<Spec | null> {
    let p = this.cache.get(ref);
    if (!p) {
      p = loadSpec(this.path, (file) => this.gh.getFileText(this.repo, file, ref));
      this.cache.set(ref, p);
      p.catch(() => this.cache.delete(ref));
    }
    return p;
  }

  /** The spec where an experiment's branch forked, and at its last commit. */
  async forExperiment(node: TreeNode): Promise<{ fork: string; before: Spec | null; after: Spec | null }> {
    const pr = await this.gh.getPull(this.repo, node.pr.number);
    const fork = await this.gh.mergeBase(this.repo, pr.base.sha ?? node.pr.baseRef, node.pr.headSha);
    const [before, after] = await Promise.all([this.at(fork), this.at(node.pr.headSha)]);
    return { fork, before, after };
  }
}

export function changeBadge(kind: SectionChangeKind): HTMLElement {
  return h("span", { class: `spec-badge ${kind}` }, t(`spec.${kind}`));
}

function sectionTitle(s: SpecSection | null, title: string): string {
  return s && s.level === 0 ? t("spec.preamble") : title || t("spec.preamble");
}

/** Section changes, each expandable into a line diff of that section. */
export function changeList(changes: readonly SectionChange[]): HTMLElement {
  return h(
    "div",
    { class: "spec-changes" },
    changes.map((c) => {
      const title = sectionTitle(c.after ?? c.before, c.title);
      const renamedFrom = c.kind === "renamed" || (c.before && c.after && c.before.title !== c.after.title) ? c.before!.title : null;
      const summary = h(
        "summary",
        { class: "file-head" },
        changeBadge(c.kind),
        h("span", { class: "spec-change-title" }, renamedFrom ? `${renamedFrom} → ${title}` : title),
      );
      const details = h("details", { class: "file spec-change" }, summary);
      details.addEventListener("toggle", () => {
        if (!details.open || details.querySelector(".patch")) return;
        const pre = h("pre", { class: "patch" });
        for (const line of lineDiff(c.before?.body ?? "", c.after?.body ?? "")) {
          pre.append(h("span", { class: `pl ${line.op === "+" ? "add" : line.op === "-" ? "del" : "ctx"}` }, `${line.op} ${line.text}` || " "));
        }
        details.append(pre);
      });
      return details;
    }),
  );
}

/** One page: every heading with its summary line, indented by level. */
export function summaryView(spec: Spec): HTMLElement {
  return h(
    "ul",
    { class: "spec-summary" },
    spec.sections
      .filter((s) => s.level > 0)
      .map((s) =>
        h(
          "li",
          { style: `--lvl: ${s.level - 1}` },
          h("span", { class: "spec-summary-title" }, s.title || t("spec.preamble")),
          s.summary ? h("span", { class: "spec-summary-text" }, s.summary) : null,
        ),
      ),
  );
}

/**
 * The full spec, section by section. `marks` badges the sections changed in this version;
 * `history` fills a section's history box when its button is pressed.
 */
export function fullView(spec: Spec, marks: ReadonlyMap<string, SectionChangeKind>, history: (key: string, box: HTMLElement) => void): HTMLElement {
  return h(
    "div",
    { class: "spec-full" },
    spec.sections.map((s) => {
      const box = h("div", { class: "spec-history", hidden: true });
      const mark = marks.get(s.key);
      const head =
        s.level === 0
          ? null
          : h(
              "div",
              { class: "spec-head" },
              h("span", { class: `spec-title spec-h${Math.min(s.level, 4)}` }, s.title || t("spec.preamble")),
              mark ? changeBadge(mark) : null,
              h(
                "button",
                {
                  class: "icon-btn spec-history-btn",
                  type: "button",
                  title: t("spec.history"),
                  "aria-label": `${t("spec.history")}: ${s.title}`,
                  onclick: () => {
                    box.hidden = !box.hidden;
                    if (!box.hidden && !box.childElementCount) history(s.key, box);
                  },
                },
                icon("clock", 14),
              ),
            );
      const body = s.body ? h("div", { class: "prose" }) : null;
      if (body) body.append(renderMarkdown(s.body));
      return h("section", { class: `spec-sec${mark ? ` changed-${mark}` : ""}` }, head, box, body);
    }),
  );
}

/** Fill `box` with the versions where section `key` was added, changed, renamed or removed. */
export function fillHistory(
  box: HTMLElement,
  store: SpecStore,
  tree: ResearchTree,
  key: string,
  chips: (ids: readonly string[]) => HTMLElement,
  navigate: (id: string) => void,
): void {
  const versions = orderedVersions(tree);
  box.append(h("p", { class: "muted small" }, t("spec.historyLoading")));
  Promise.all(versions.map((v) => store.at(versionRef(tree, v))))
    .then((specs) => {
      clear(box);
      const hist = sectionHistory(
        versions.map((v, i) => ({ name: v.id, sections: specs[i]?.sections ?? null })),
        key,
      );
      box.append(h("div", { class: "section-label" }, t("spec.historyTitle")));
      if (!hist.length) box.append(h("p", { class: "muted small" }, t("spec.historyEmpty")));
      for (const entry of hist) {
        const v = versions.find((x) => x.id === entry.version)!;
        box.append(
          h(
            "div",
            { class: "spec-history-row" },
            h("button", { class: "chip version", onclick: () => navigate(v.id) }, h("span", { class: "chip-dot" }), `${tree.root} ${v.name}`),
            changeBadge(entry.kind),
            v.mergedFrom.length ? chips(v.mergedFrom) : null,
          ),
        );
      }
    })
    .catch((e: unknown) => {
      clear(box);
      box.append(h("p", { class: "form-error" }, t("spec.failed", { error: e instanceof Error ? e.message : String(e) })));
    });
}
