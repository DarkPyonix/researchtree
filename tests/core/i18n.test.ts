import { afterEach, describe, expect, it } from "vitest";
import {
  detectLocale,
  formatMessage,
  getLocale,
  MESSAGES,
  normalizeTreeConfig,
  placeholders,
  resolveLocale,
  setLocale,
  t,
  updateMeta,
} from "../../apps/core/src";

afterEach(() => setLocale("en"));

describe("i18n tables", () => {
  const ko = MESSAGES.ko;
  const en = MESSAGES.en;

  it("ko and en have exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ko).sort());
  });

  it.each(Object.keys(ko))("%s uses the same placeholders in ko and en", (key) => {
    const k = key as keyof typeof ko;
    expect(placeholders(en[k])).toEqual(placeholders(ko[k]));
  });

  it("has no empty messages", () => {
    for (const table of [ko, en]) for (const [key, msg] of Object.entries(table)) expect(msg.trim(), key).not.toBe("");
  });
});

describe("formatMessage", () => {
  it("fills {name} placeholders", () => {
    expect(formatMessage("{a} and {b}", { a: 1, b: "x" })).toBe("1 and x");
  });

  it("keeps unknown placeholders", () => {
    expect(formatMessage("{a} {b}", { a: 1 })).toBe("1 {b}");
  });

  it("picks a word form with {n|one|other}", () => {
    expect(formatMessage("{n} {n|file|files}", { n: 1 })).toBe("1 file");
    expect(formatMessage("{n} {n|file|files}", { n: 3 })).toBe("3 files");
    expect(formatMessage("{n} {n|file|files}", { n: 0 })).toBe("0 files");
  });
});

describe("locale", () => {
  it("detectLocale picks ko for any ko* language, otherwise en", () => {
    expect(detectLocale(["ko-KR", "en-US"])).toBe("ko");
    expect(detectLocale(["en-US", "ko"])).toBe("ko");
    expect(detectLocale(["KO"])).toBe("ko");
    expect(detectLocale(["ja-JP", "en"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("resolveLocale prefers a saved locale over the environment", () => {
    expect(resolveLocale("en", ["ko-KR"])).toBe("en");
    expect(resolveLocale("ko", ["en-US"])).toBe("ko");
    expect(resolveLocale("auto", ["ko-KR"])).toBe("ko");
    expect(resolveLocale(undefined, ["fr"])).toBe("en");
    expect(resolveLocale("de", ["ko"])).toBe("ko");
  });

  it("t follows the current locale", () => {
    setLocale("ko");
    expect(getLocale()).toBe("ko");
    expect(t("status.adopted")).toBe("채택");
    expect(t("gens.all", { n: 3 })).toBe("전체 3");
    setLocale("en");
    expect(t("status.adopted")).toBe("Adopted");
    expect(t("tree.versionSub", { date: "2025.01.02", n: 1 })).toBe("2025.01.02 · 1 merged experiment");
  });

  it("core error messages are localized", () => {
    setLocale("ko");
    expect(normalizeTreeConfig({ root: "a..b" })).toEqual({ error: "루트 브랜치 이름이 올바르지 않습니다." });
    setLocale("en");
    expect(normalizeTreeConfig({ root: "a..b" })).toEqual({ error: "The root branch name is invalid." });
    expect(() => updateMeta("```yaml\na: [\n```\n", { hypothesis: "x" })).toThrow("could not be parsed");
  });
});
