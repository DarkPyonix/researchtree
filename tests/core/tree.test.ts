import { describe, expect, it } from "vitest";
import demo from "../../apps/ui/src/hosts/demo-prs.json";
import { buildTree, metricKeys, pathTo, type PullRequest } from "../../apps/core/src";

const prs = demo as PullRequest[];
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

describe("buildTree (demo fixture)", () => {
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
