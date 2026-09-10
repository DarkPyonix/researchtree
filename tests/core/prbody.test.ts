import { describe, expect, it } from "vitest";
import cases from "../fixtures/prbody-cases.json";
import { bodyTemplate, parseBody, PrBodyError, replaceMarkdown, setConclusion, updateMeta, type MetaPatch } from "../../apps/core/src";

describe("parseBody (공유 fixture)", () => {
  for (const c of cases.parse) {
    it(c.name, () => {
      const parsed = parseBody(c.body);
      expect(parsed.meta).toEqual(c.meta);
      expect(parsed.markdown).toBe(c.markdown);
      expect(parsed.warnings).toEqual(c.warnings);
    });
  }
});

describe("updateMeta (공유 fixture)", () => {
  for (const c of cases.update) {
    it(c.name, () => {
      expect(updateMeta(c.body, c.patch as MetaPatch)).toBe(c.expected);
    });
  }
});

describe("updateMeta", () => {
  it("파싱과 재작성 왕복이 무손실이다", () => {
    const body = "앞 메모\n\n```yaml\n# keep\nhypothesis: h # inline\nseed: 1\n```\n\n## 결론\n본문 **그대로**\n";
    const updated = updateMeta(body, { change: "c" });
    expect(updated).toContain("# keep");
    expect(updated).toContain("# inline");
    expect(updated.startsWith("앞 메모\n\n```yaml\n")).toBe(true);
    expect(updated.endsWith("\n## 결론\n본문 **그대로**\n")).toBe(true);
    expect(parseBody(updated).meta).toEqual({ hypothesis: "h", seed: 1, change: "c" });
  });

  it("깨진 YAML은 덮어쓰지 않는다", () => {
    expect(() => updateMeta("```yaml\na: [\n```\n", { hypothesis: "x" })).toThrow(PrBodyError);
  });

  it("메트릭 하나만 지울 수 있다", () => {
    const out = updateMeta("```yaml\nmetrics:\n  a: 1\n  b: 2\n```\n", { metrics: { a: null } });
    expect(parseBody(out).meta.metrics).toEqual({ b: 2 });
  });
});

describe("markdown 편집", () => {
  const body = "```yaml\nhypothesis: h\n```\n\n## 진행 상황\n진행 중\n";

  it("replaceMarkdown은 YAML 블록을 유지한다", () => {
    const out = replaceMarkdown(body, "새 본문");
    expect(out).toBe("```yaml\nhypothesis: h\n```\n\n새 본문\n");
  });

  it("setConclusion은 결론 섹션을 앞에 만든다", () => {
    const out = setConclusion(body, "기각");
    expect(parseBody(out).markdown).toBe("## 결론\n기각\n\n## 진행 상황\n진행 중");
  });

  it("setConclusion은 기존 결론을 교체한다", () => {
    const out = setConclusion("```yaml\nhypothesis: h\n```\n\n## 결론\n예전\n\n## 메모\nm\n", "새 결론");
    expect(parseBody(out).markdown).toBe("## 결론\n새 결론\n\n## 메모\nm");
  });
});

describe("bodyTemplate", () => {
  it("파싱 가능한 템플릿을 만든다", () => {
    const parsed = parseBody(bodyTemplate({ parent: "research", hypothesis: "가설" }));
    expect(parsed.meta.parent).toBe("research");
    expect(parsed.meta.hypothesis).toBe("가설");
    expect(parsed.warnings).toEqual([]);
  });
});
