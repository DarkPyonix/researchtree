import { describe, expect, it } from "vitest";
import { DEFAULT_TREE_CONFIG } from "@researchtree/core";
import { mergeConfig, parseSettings, settingParam } from "../../apps/ui/src/settings-url";

describe("parseSettings", () => {
  it("reads every key the settings dialog can set", () => {
    const s = parseSettings("lang:en,root:trunk,prefix:try/");
    expect(s.locale).toBe("en");
    expect(s.config).toEqual({ root: "trunk", prefix: "try/" });
    expect(s.ignored).toEqual([]);
  });

  it("takes one key on its own and ignores spacing", () => {
    expect(parseSettings(" lang : ko ").locale).toBe("ko");
    expect(parseSettings("root:trunk").config).toEqual({ root: "trunk" });
  });

  it("keeps a value that contains a colon or a slash", () => {
    expect(parseSettings("prefix:team/exp:").config).toEqual({ prefix: "team/exp:" });
  });

  it("ignores unknown keys, empty values and bad languages, and never throws", () => {
    const s = parseSettings("theme:dark,lang:fr,root:,prefix:exp/");
    expect(s.locale).toBeUndefined();
    expect(s.config).toEqual({ prefix: "exp/" });
    expect(s.ignored).toEqual(["theme", "lang", "root"]);
    expect(parseSettings(null)).toEqual({ ignored: [] });
    expect(parseSettings("")).toEqual({ ignored: [] });
  });
});

describe("settingParam", () => {
  const defaults = DEFAULT_TREE_CONFIG;

  it("is null when nothing differs from the default", () => {
    expect(settingParam({ locale: "auto", config: defaults, defaults })).toBeNull();
  });

  it("lists only what differs, language first", () => {
    expect(settingParam({ locale: "en", config: { ...defaults, prefix: "try/" }, defaults })).toBe("lang:en,prefix:try/");
  });

  it("round-trips through parseSettings", () => {
    const config = { root: "trunk", prefix: "try/" };
    const text = settingParam({ locale: "ko", config, defaults })!;
    expect(parseSettings(text)).toEqual({ locale: "ko", config, ignored: [] });
  });
});

describe("mergeConfig", () => {
  const saved = DEFAULT_TREE_CONFIG;

  it("fills the missing half from what is saved", () => {
    expect(mergeConfig(saved, { root: "trunk" })).toEqual({ root: "trunk", prefix: saved.prefix });
  });

  it("is null when there is nothing to change or the value is invalid", () => {
    expect(mergeConfig(saved, undefined)).toBeNull();
    expect(mergeConfig(saved, { root: saved.root })).toBeNull();
    expect(mergeConfig(saved, { root: "  " })).toBeNull();
  });
});
