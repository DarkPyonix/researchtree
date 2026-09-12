import { describe, expect, it } from "vitest";
import { fullRepo, readPlace, shortRepo } from "../../apps/ui/src/url";

describe("readPlace", () => {
  it("an account alone opens its island", () => {
    expect(readPlace("?user=b-re-w")).toEqual({ user: "b-re-w", repo: null });
  });

  it("a bare repo name belongs to the account in the address", () => {
    expect(readPlace("?user=b-re-w&repo=moshi")).toEqual({ user: "b-re-w", repo: "b-re-w/moshi" });
  });

  it("a research done under an organization keeps its owner", () => {
    // A researcher's island may hold work they did in an org, so owner/name has to survive.
    expect(readPlace("?user=b-re-w&repo=DarkPyonix/tts")).toEqual({ user: "b-re-w", repo: "DarkPyonix/tts" });
  });

  it("a repo without an account opens nothing: every address names whose island it is", () => {
    expect(readPlace("?repo=DarkPyonix/tts")).toEqual({ user: null, repo: null });
  });

  it("a bare name without an account opens nothing", () => {
    expect(readPlace("?repo=moshi")).toEqual({ user: null, repo: null });
  });

  it("ignores nonsense instead of trusting it", () => {
    expect(readPlace("?user=a/b&repo=x")).toEqual({ user: null, repo: null });
    expect(readPlace("?user=b-re-w&repo=a/b/c")).toEqual({ user: "b-re-w", repo: null });
    expect(readPlace("?user=%20&repo=")).toEqual({ user: null, repo: null });
    expect(readPlace("")).toEqual({ user: null, repo: null });
  });
});

describe("writing an address back", () => {
  it("drops the owner only when it is the island's own", () => {
    expect(shortRepo("b-re-w", "b-re-w/moshi")).toBe("moshi");
    expect(shortRepo("b-re-w", "DarkPyonix/tts")).toBe("DarkPyonix/tts");
    expect(shortRepo(null, "DarkPyonix/tts")).toBe("DarkPyonix/tts");
  });

  it("round-trips whatever it wrote", () => {
    for (const [user, repo] of [
      ["b-re-w", "b-re-w/moshi"],
      ["b-re-w", "DarkPyonix/tts"],
      [null, "DarkPyonix/tts"],
    ] as [string | null, string][]) {
      expect(fullRepo(user, shortRepo(user, repo))).toBe(repo);
    }
  });
});
