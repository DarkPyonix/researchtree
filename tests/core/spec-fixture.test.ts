import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkSpec, diffSpecs, loadSpec, parseRepoConfig, parseSpec, sectionHistory, slugify } from "../../apps/core/src";

// Shared with the Python port (apps/researchtree/memory/spec.py): both must turn spec-cases.json
// into spec-expected.json. Regenerate after an intended rule change with RT_UPDATE_FIXTURES=1 npm test.
const dir = new URL("../fixtures/", import.meta.url);
type Cases = {
  slugify: string[];
  parse: { name: string; text: string }[];
  load: { name: string; entry: string; files: Record<string, string> }[];
  diff: { name: string; before: string | null; after: string }[];
  history: { name: string; key: string; versions: { name: string; text: string | null }[] }[];
  check: { name: string; text: string; missing: string[] }[];
  config: { name: string; text: string }[];
};
const cases = JSON.parse(readFileSync(new URL("spec-cases.json", dir), "utf8")) as Cases;

async function canonical() {
  const load = [];
  for (const c of cases.load) {
    const spec = await loadSpec(c.entry, async (p) => c.files[p] ?? null);
    load.push({ name: c.name, spec: spec && { title: spec.title, text: spec.text, keys: spec.sections.map((s) => s.key), missing: spec.missing } });
  }
  return {
    slugify: cases.slugify.map(slugify),
    parse: cases.parse.map((c) => ({ name: c.name, sections: parseSpec(c.text) })),
    load,
    diff: cases.diff.map((c) => ({
      name: c.name,
      changes: diffSpecs(c.before === null ? null : parseSpec(c.before), parseSpec(c.after)).map((x) => ({ key: x.key, kind: x.kind, title: x.title })),
    })),
    history: cases.history.map((c) => ({
      name: c.name,
      history: sectionHistory(
        c.versions.map((v) => ({ name: v.name, sections: v.text === null ? null : parseSpec(v.text) })),
        c.key,
      ),
    })),
    check: cases.check.map((c) => ({ name: c.name, issues: checkSpec({ sections: parseSpec(c.text), missing: c.missing }) })),
    config: cases.config.map((c) => ({ name: c.name, ...parseRepoConfig(c.text) })),
  };
}

describe("shared spec fixture", () => {
  it("matches spec-expected.json", async () => {
    const got = await canonical();
    const file = new URL("spec-expected.json", dir);
    if (process.env.RT_UPDATE_FIXTURES) writeFileSync(file, JSON.stringify(got, null, 2) + "\n");
    expect(got).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });
});
