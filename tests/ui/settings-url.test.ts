import { describe, expect, it } from "vitest";
import { DEFAULT_TREE_CONFIG } from "@researchtree/core";
import { mergeConfig, parseSettings, settingParams } from "../../apps/ui/src/settings-url";

describe("parseSettings", () => {
  it("reads every query the settings dialog can set", () => {
    const s = parseSettings("?repo=lab/moshi&lang=en&root=trunk&prefix=try/");
    expect(s.locale).toBe("en");
    expect(s.config).toEqual({ root: "trunk", prefix: "try/" });
    expect(s.ignored).toEqual([]);
  });

  it("takes one on its own and ignores spacing", () => {
    expect(parseSettings("?lang=%20ko%20").locale).toBe("ko");
    expect(parseSettings("?root=trunk").config).toEqual({ root: "trunk" });
  });

  it("keeps a value that contains a slash", () => {
    expect(parseSettings("?prefix=team/exp/").config).toEqual({ prefix: "team/exp/" });
  });

  it("ignores empty values and bad languages, and never throws", () => {
    const s = parseSettings("?lang=fr&root=&prefix=exp/");
    expect(s.locale).toBeUndefined();
    expect(s.config).toEqual({ prefix: "exp/" });
    expect(s.ignored).toEqual(["lang", "root"]);
    expect(parseSettings("")).toEqual({ ignored: [] });
    expect(parseSettings("?repo=lab/moshi")).toEqual({ ignored: [] });
  });
});

describe("settingParams", () => {
  const defaults = DEFAULT_TREE_CONFIG;

  it("leaves out everything that is at its default", () => {
    expect(settingParams({ locale: "auto", config: defaults, defaults })).toEqual({ lang: null, root: null, prefix: null });
  });

  it("names only what differs", () => {
    expect(settingParams({ locale: "en", config: { ...defaults, prefix: "try/" }, defaults })).toEqual({ lang: "en", root: null, prefix: "try/" });
  });

  it("round-trips through parseSettings", () => {
    const config = { root: "trunk", prefix: "try/" };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(settingParams({ locale: "ko", config, defaults }))) if (value) params.set(key, value);
    expect(params.toString()).toBe("lang=ko&root=trunk&prefix=try%2F");
    expect(parseSettings(params)).toEqual({ locale: "ko", config, ignored: [] });
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
