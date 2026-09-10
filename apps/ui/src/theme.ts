import { getLocale, LOCALE_TAGS, t, type MetricValue, type NodeWarning, type Status } from "@researchtree/core";

/** One color per top-level branch; descendants inherit it. */
export const BRANCH_COLORS = ["#c8553d", "#e09f3e", "#3d7a6b", "#4b6fa8", "#8a5a9e", "#b5475f", "#6b8f3a", "#b0772c"];

export function statusLabel(status: Status | "draft"): string {
  return t(`status.${status}`);
}

export function warningLabel(warning: NodeWarning): string {
  return t(`warning.${warning}`);
}

/** Guess whether lower or higher is better from the metric name. null means unknown (shown without color). */
export function metricDirection(key: string): "lower" | "higher" | null {
  if (/loss|wer|cer|error|latency|ppl|perplexity|_ms$|fid/i.test(key)) return "lower";
  if (/acc|score|bleu|f1|mos|precision|recall|auc|rouge|win/i.test(key)) return "higher";
  return null;
}

export function formatMetric(v: MetricValue | undefined): string {
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (Number.isInteger(v)) return v.toLocaleString(LOCALE_TAGS[getLocale()]);
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
