import { describe, expect, it } from "vitest";
import { parseSettings, settingParams } from "../../apps/ui/src/settings-url";

// Branch names are not here on purpose: they belong to the repository's own .researchtree.yml
// (docs/CONVENTIONS.md), so a link can never make two people see different trees.
describe("parseSettings", () => {
  it("reads the language a link asks for", () => {
    expect(parseSettings("?repo=lab/moshi&lang=en").locale).toBe("en");
    expect(parseSettings("?lang=%20ko%20").locale).toBe("ko");
    expect(parseSettings("?lang=auto").locale).toBe("auto");
  });

  it("ignores an empty or unknown language, and never throws", () => {
    expect(parseSettings("?lang=fr")).toEqual({ locale: undefined, ignored: ["lang"] });
    expect(parseSettings("?lang=")).toEqual({ ignored: ["lang"] });
    expect(parseSettings("")).toEqual({ ignored: [] });
    expect(parseSettings("?repo=lab/moshi")).toEqual({ ignored: [] });
  });

  it("leaves branch queries alone: they are not settings any more", () => {
    expect(parseSettings("?root=trunk&prefix=try/")).toEqual({ ignored: [] });
  });
});

describe("settingParams", () => {
  it("writes nothing when the language follows the reader's own", () => {
    expect(settingParams({ locale: "auto" })).toEqual({ lang: null });
  });

  it("round-trips a chosen language", () => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(settingParams({ locale: "ko" }))) if (value) params.set(key, value);
    expect(params.toString()).toBe("lang=ko");
    expect(parseSettings(params)).toEqual({ locale: "ko", ignored: [] });
  });
});
