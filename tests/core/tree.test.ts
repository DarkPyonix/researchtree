import { describe, expect, it } from "vitest";
import sample from "../fixtures/prs-sample.json";
import { buildTree, displayName, metricKeys, normalizeTreeConfig, parentMetrics, pathTo, seasonOf, type PullRequest } from "../../apps/core/src";

const prs = sample as PullRequest[];
const tree = buildTree(prs, "darkpyonix/moshi-research-demo");

function pr(partial: Omit<Partial<PullRequest>, "head" | "base"> & { head: string; base: string; n: number }): PullRequest {
  return {
    number: partial.n,
    html_url: "",
    title: partial.head,
    state: partial.state ?? "open",
    merged_at: partial.merged_at ?? null,
    created_at: partial.created_at ?? `2026-01-${String(partial.n).padStart(2, "0")}T00:00:00Z`,
    updated_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    body: partial.body ?? "```yaml\nhypothesis: h\n```",
    user: { login: "u" },
    head: { ref: partial.head, sha: "x" },
    base: { ref: partial.base },
  };
}

describe("buildTree (sample fixture)", () => {
  it("research와 experiment/* 외의 PR은 숨긴다", () => {
    expect(tree.nodes.has("develop")).toBe(false);
    expect(tree.nodes.has("experiment/hotfix-logging")).toBe(false);
  });

  it("루트 직속 자식은 생성 순서대로 정렬된다", () => {
    expect(tree.rootChildren).toEqual([
      "experiment/baseline-moshi",
      "experiment/data-dedup",
      "experiment/sampling-temp",
      "experiment/persona-prompt",
    ]);
  });

  it("PR 상태로 실험 상태를 정한다", () => {
    expect(tree.nodes.get("experiment/depth-lr-warmup")!.status).toBe("adopted");
    expect(tree.nodes.get("experiment/depth-lr-half")!.status).toBe("rejected");
    expect(tree.nodes.get("experiment/warmup-cosine")!.status).toBe("running");
  });

  it("YAML parent가 base보다 우선한다", () => {
    const node = tree.nodes.get("experiment/mimi-freeze")!;
    expect(node.parent).toBe("experiment/depth-lr-warmup");
    expect(node.depth).toBe(3);
    expect(pathTo(tree, node.id)).toEqual(["experiment/baseline-moshi", "experiment/depth-lr-warmup", "experiment/mimi-freeze"]);
  });

  it("한 브랜치에 PR이 여러 개면 가장 최근 PR을 쓴다", () => {
    expect(tree.nodes.get("experiment/text-token-delay")!.pr.number).toBe(7);
  });

  it("부모가 없는 노드는 고아로 루트에 붙인다", () => {
    const node = tree.nodes.get("experiment/sampling-temp")!;
    expect(node.orphan).toBe(true);
    expect(node.parent).toBe("research");
    expect(node.warnings).toContain("orphan");
  });

  it("모든 메트릭 키를 모은다", () => {
    expect(metricKeys(tree)).toEqual(expect.arrayContaining(["val_loss", "wer", "persona_score", "latency_ms"]));
  });
});

describe("buildTree (엣지 케이스)", () => {
  it("base가 main이어도 YAML parent가 있으면 보인다", () => {
    const t = buildTree([pr({ n: 1, head: "experiment/a", base: "main", body: "```yaml\nparent: research\nhypothesis: h\n```" })], "o/r");
    expect(t.rootChildren).toEqual(["experiment/a"]);
  });

  it("순환 참조를 끊는다", () => {
    const t = buildTree(
      [
        pr({ n: 1, head: "experiment/a", base: "experiment/b" }),
        pr({ n: 2, head: "experiment/b", base: "experiment/a" }),
      ],
      "o/r",
    );
    const ids = [...t.nodes.values()];
    expect(ids.some((n) => n.warnings.includes("cycle"))).toBe(true);
    expect(t.rootChildren.length).toBeGreaterThan(0);
    // Every node must be reachable from the root
    const reach = new Set<string>();
    const visit = (id: string) => {
      reach.add(id);
      t.nodes.get(id)!.children.forEach(visit);
    };
    t.rootChildren.forEach(visit);
    expect(reach.size).toBe(2);
  });

  it("자기 자신을 부모로 두면 고아가 된다", () => {
    const t = buildTree([pr({ n: 1, head: "experiment/a", base: "research", body: "```yaml\nparent: experiment/a\nhypothesis: h\n```" })], "o/r");
    expect(t.nodes.get("experiment/a")!.orphan).toBe(true);
  });

  it("YAML status가 PR 상태를 덮어쓴다", () => {
    const t = buildTree([pr({ n: 1, head: "experiment/a", base: "research", body: "```yaml\nhypothesis: h\nstatus: adopted\n```" })], "o/r");
    expect(t.nodes.get("experiment/a")!.status).toBe("adopted");
  });

  it("루트와 접두사를 바꿀 수 있다", () => {
    const t = buildTree([pr({ n: 1, head: "exp/a", base: "lab" })], "o/r", { root: "lab", prefix: "exp/" });
    expect(t.rootChildren).toEqual(["exp/a"]);
  });
});

describe("buildTree (research versions)", () => {
  const tags = [
    { name: "research/v1", sha: "s1", date: "2026-01-01T00:00:00Z" },
    { name: "research/v2", sha: "m2", date: "2026-01-10T00:00:00Z" },
    { name: "research/v3", sha: "m3", date: "2026-01-20T00:00:00Z" },
    // Release tags on main are not research versions.
    { name: "v9", sha: "rel", date: "2026-01-05T00:00:00Z" },
  ];
  const merged = (n: number, head: string, at: string, sha: string, parent = "research@v1") =>
    ({ ...pr({ n, head, base: "research", body: `\`\`\`yaml\nparent: ${parent}\nhypothesis: h\n\`\`\`` }), state: "closed", merged_at: at, merge_commit_sha: sha }) as PullRequest;

  const t = buildTree(
    [
      merged(1, "experiment/a", "2026-01-09T00:00:00Z", "m2"),
      pr({ n: 2, head: "experiment/b", base: "research", body: "```yaml\nparent: research@v1\nhypothesis: h\n```" }),
      merged(3, "experiment/c", "2026-01-19T00:00:00Z", "zzz", "research@v2"),
      { ...pr({ n: 4, head: "experiment/d", base: "research" }), created_at: "2026-01-15T00:00:00Z" },
      pr({ n: 5, head: "experiment/e", base: "research", body: "```yaml\nparent: research@v9\nhypothesis: h\n```" }),
    ],
    "o/r",
    undefined,
    tags,
  );

  it("첫 버전은 루트이고 나머지는 버전 노드가 된다", () => {
    expect(t.rootVersion).toBe("v1");
    expect([...t.versions.keys()]).toEqual(["research@v2", "research@v3"]);
  });

  it("research@vN으로 시작한 실험은 그 버전에 붙는다", () => {
    expect(t.nodes.get("experiment/a")!.parent).toBe("research");
    expect(t.nodes.get("experiment/c")!.parent).toBe("research@v2");
    expect(t.nodes.get("experiment/c")!.version).toBe("v2");
  });

  it("parent가 없으면 PR을 연 시점의 최신 버전으로 추론한다", () => {
    expect(t.nodes.get("experiment/d")!.parent).toBe("research@v2");
  });

  it("머지 커밋이 태그와 같으면 그 버전을, 아니면 머지 이후 첫 버전을 만든다", () => {
    expect(t.nodes.get("experiment/a")!.produces).toBe("research@v2");
    expect(t.versions.get("research@v2")!.parent).toBe("experiment/a");
    expect(t.nodes.get("experiment/c")!.produces).toBe("research@v3");
    expect(t.versions.get("research@v3")!.parent).toBe("experiment/c");
  });

  it("본선이 v1 → a → v2 → c → v3 로 이어진다", () => {
    expect(pathTo(t, "research@v3")).toEqual(["experiment/a", "research@v2", "experiment/c", "research@v3"]);
    expect(t.versions.get("research@v3")!.depth).toBe(4);
  });

  it("없는 버전을 가리키면 경고와 함께 루트에 붙는다", () => {
    const e = t.nodes.get("experiment/e")!;
    expect(e.parent).toBe("research");
    expect(e.warnings).toContain("unknown-version");
  });

  it("버전 노드의 메트릭은 마지막으로 합쳐진 실험을 따른다", () => {
    expect(parentMetrics(t, "experiment/d")).toEqual(t.nodes.get("experiment/a")!.meta.metrics);
  });
});

describe("normalizeTreeConfig", () => {
  it("접두사 끝에 / 를 붙이고 기본값을 채운다", () => {
    expect(normalizeTreeConfig({ root: "main-research", prefix: "exp" })).toEqual({ root: "main-research", prefix: "exp/" });
    expect(normalizeTreeConfig({})).toEqual({ root: "research", prefix: "experiment/" });
  });

  it("잘못된 이름을 거부한다", () => {
    expect(normalizeTreeConfig({ root: "a..b" })).toBeNull();
    expect(normalizeTreeConfig({ root: "exp/x", prefix: "exp/" })).toBeNull();
  });

  it("설정한 이름으로 트리를 만든다", () => {
    const t = buildTree([pr({ n: 1, head: "exp/a", base: "lab" })], "o/r", { root: "lab", prefix: "exp/" });
    expect(t.prefix).toBe("exp/");
    expect(displayName(t, "exp/a")).toBe("a");
  });
});

describe("시간과 계절", () => {
  it("seasonOf는 북반구 기준 계절을 돌려준다", () => {
    expect(seasonOf("2026-04-10T00:00:00Z")).toBe("spring");
    expect(seasonOf("2026-07-10T00:00:00Z")).toBe("summer");
    expect(seasonOf("2026-10-10T00:00:00Z")).toBe("autumn");
    expect(seasonOf("2026-01-10T00:00:00Z")).toBe("winter");
  });

  it("YAML started/ended > 커밋 날짜 > PR 날짜 순으로 쓴다", () => {
    const a = pr({ n: 1, head: "experiment/a", base: "research", body: "```yaml\nhypothesis: h\nstarted: 2025-03-02\nended: 2025-11-20\n```" });
    const b = pr({ n: 2, head: "experiment/b", base: "research" });
    const c = pr({ n: 3, head: "experiment/c", base: "research" });
    const t = buildTree([a, b, c], "o/r", undefined, [], new Map([[2, { first: "2025-06-01T00:00:00Z", last: "2025-12-24T00:00:00Z" }]]));
    expect(t.nodes.get("experiment/a")!.startedAt).toBe("2025-03-02T00:00:00.000Z");
    expect(seasonOf(t.nodes.get("experiment/a")!.lastWorkAt)).toBe("autumn");
    expect(t.nodes.get("experiment/b")!.startedAt).toBe("2025-06-01T00:00:00Z");
    expect(seasonOf(t.nodes.get("experiment/b")!.lastWorkAt)).toBe("winter");
    expect(t.nodes.get("experiment/c")!.startedAt).toBe(c.created_at);
  });
});
