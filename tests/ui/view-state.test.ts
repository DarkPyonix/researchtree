import { describe, expect, it } from "vitest";
import { parseViewState } from "../../apps/ui/src/view-state";

const full = { repo: "lab/moshi", node: "experiment/depth", mode: "flat", board: false, hidden: ["rejected"], camera: [1, 2, 3, 4, 5, 6] };

describe("parseViewState", () => {
  it("reads back a state it was given", () => {
    expect(parseViewState(full)).toEqual(full);
  });

  it("needs a repository, and nothing else", () => {
    expect(parseViewState({ repo: "lab/moshi" })).toEqual({ repo: "lab/moshi", node: null, mode: "island", board: false, hidden: [], camera: [] });
    expect(parseViewState({ node: "x" })).toBeNull();
    expect(parseViewState({ repo: "moshi" })).toBeNull();
  });

  it("never trusts what it reads: a slide can hold anything", () => {
    expect(parseViewState(null)).toBeNull();
    expect(parseViewState("{}")).toBeNull();
    expect(parseViewState({ repo: "lab/moshi", hidden: ["running", "nonsense", 7], camera: "far" })).toEqual({
      repo: "lab/moshi",
      node: null,
      mode: "island",
      board: false,
      hidden: ["running"],
      camera: [],
    });
  });

  it("drops a camera that is not six numbers", () => {
    expect(parseViewState({ ...full, camera: [1, 2, 3] })?.camera).toEqual([]);
    expect(parseViewState({ ...full, camera: [1, 2, 3, 4, 5, Number.NaN] })?.camera).toEqual([]);
  });
});
