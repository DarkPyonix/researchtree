import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTree, type PullActivity, type PullRequest, type VersionTag } from "../../apps/core/src";

// Shared with the Python port (apps/researchtree/memory/build.py): both must produce tree-expected.json.
// Regenerate after an intended rule change with RT_UPDATE_FIXTURES=1 npm test, then update Python.
const dir = new URL("../fixtures/", import.meta.url);
const sample = JSON.parse(readFileSync(new URL("tree-sample.json", dir), "utf8")) as {
  repo: string;
  config: { root: string; prefix: string };
  prs: PullRequest[];
  tags: VersionTag[];
  activity: Record<string, PullActivity>;
};

function canonical() {
  const activity = new Map(Object.entries(sample.activity).map(([k, v]) => [Number(k), v]));
  const tree = buildTree(sample.prs, sample.repo, sample.config, sample.tags, activity);
  const ms = (iso: string) => new Date(iso).getTime();
  return {
    rootVersion: tree.rootVersion,
    rootChildren: tree.rootChildren,
    nodes: Object.fromEntries(
      [...tree.nodes.values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((n) => [
          n.id,
          {
            parent: n.parent,
            status: n.status,
            version: n.version ?? null,
            produces: n.produces ?? null,
            depth: n.depth,
            orphan: n.orphan,
            warnings: [...n.warnings].sort(),
            children: n.children,
            started: ms(n.startedAt),
            lastWork: ms(n.lastWorkAt),
          },
        ]),
    ),
    versions: Object.fromEntries(
      [...tree.versions.values()].map((v) => [v.id, { name: v.name, parent: v.parent, mergedFrom: v.mergedFrom, grownFrom: v.grownFrom, children: v.children, depth: v.depth }]),
    ),
  };
}

describe("shared tree fixture", () => {
  it("matches tree-expected.json", () => {
    const got = canonical();
    const file = new URL("tree-expected.json", dir);
    if (process.env.RT_UPDATE_FIXTURES) writeFileSync(file, JSON.stringify(got, null, 2) + "\n");
    expect(got).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });
});
