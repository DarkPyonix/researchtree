import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIslandMap } from "../../apps/core/src";

// Shared with the Python port (apps/researchtree/island.py): both must turn island-cases.json into
// island-expected.json. Regenerate after an intended rule change with RT_UPDATE_FIXTURES=1 npm test.
const dir = new URL("../fixtures/", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("island-cases.json", dir), "utf8")) as { maps: { name: string; text: string }[] };

describe("shared island map fixture", () => {
  it("matches island-expected.json", () => {
    const got = { maps: cases.maps.map((c) => ({ name: c.name, ...parseIslandMap(c.text) })) };
    const file = new URL("island-expected.json", dir);
    if (process.env.RT_UPDATE_FIXTURES) writeFileSync(file, JSON.stringify(got, null, 2) + "\n");
    expect(got).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });
});
