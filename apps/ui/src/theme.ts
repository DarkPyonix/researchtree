import type { MetricValue, NodeWarning, Status } from "@researchtree/core";

/** One color per top-level branch; descendants inherit it. */
export const BRANCH_COLORS = ["#c8553d", "#e09f3e", "#3d7a6b", "#4b6fa8", "#8a5a9e", "#b5475f", "#6b8f3a", "#b0772c"];

export const STATUS_LABEL: Record<Status, string> = {
  running: "진행 중",
  adopted: "채택",
  rejected: "기각",
};

export const WARNING_LABEL: Record<NodeWarning, string> = {
  "no-yaml-block": "PR 본문에 YAML 블록이 없습니다.",
  "yaml-parse-error": "YAML 블록을 해석할 수 없습니다. 형식을 확인해 주세요.",
  "missing-hypothesis": "hypothesis(가설) 필드가 비어 있습니다.",
  "invalid-status": "status 값이 running / adopted / rejected 중 하나가 아닙니다.",
  "invalid-field": "일부 필드의 형식이 올바르지 않아 무시했습니다.",
  orphan: "부모 실험을 찾을 수 없어 research 아래에 표시했습니다.",
  cycle: "부모 관계가 순환해서 research 아래에 표시했습니다.",
};

/** Guess whether lower or higher is better from the metric name. null means unknown (shown without color). */
export function metricDirection(key: string): "lower" | "higher" | null {
  if (/loss|wer|cer|error|latency|ppl|perplexity|_ms$|fid/i.test(key)) return "lower";
  if (/acc|score|bleu|f1|mos|precision|recall|auc|rouge|win/i.test(key)) return "higher";
  return null;
}

export function formatMetric(v: MetricValue | undefined): string {
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (Number.isInteger(v)) return v.toLocaleString("ko-KR");
  const abs = Math.abs(v);
  return abs >= 100 ? v.toFixed(1) : abs >= 1 ? v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") : String(Number(v.toPrecision(3)));
}

export function formatDelta(cur: MetricValue | undefined, prev: MetricValue | undefined): { text: string; delta: number } | null {
  if (typeof cur !== "number" || typeof prev !== "number") return null;
  const d = cur - prev;
  if (d === 0) return { text: "±0", delta: 0 };
  const rel = prev !== 0 ? ` (${d > 0 ? "+" : ""}${((d / Math.abs(prev)) * 100).toFixed(1)}%)` : "";
  return { text: `${d > 0 ? "+" : ""}${formatMetric(Number(d.toPrecision(3)))}${rel}`, delta: d };
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
