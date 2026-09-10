import { isMap, parseDocument, Document, YAMLMap } from "yaml";
import { t } from "./i18n";
import { STATUSES, type ExperimentMeta, type NodeWarning, type Status } from "./types";

/** First ```yaml fenced block in the body. Opening and closing fences must each be on their own line. */
const FENCE_RE = /^```ya?ml[ \t]*\r?\n([\s\S]*?)^```[ \t]*(?:\r?\n|$)/m;

export interface ParsedBody {
  meta: ExperimentMeta;
  /** Whether a YAML block was found */
  hasBlock: boolean;
  /** Raw YAML (empty when there is no block) */
  yaml: string;
  /** Text before the YAML block */
  before: string;
  /** Text after the YAML block */
  after: string;
  /** Human-facing markdown without the YAML block */
  markdown: string;
  warnings: NodeWarning[];
}

interface Located {
  start: number;
  end: number;
  yaml: string;
}

function locate(body: string): Located | null {
  const m = FENCE_RE.exec(body);
  if (!m || m.index === undefined) return null;
  return { start: m.index, end: m.index + m[0].length, yaml: m[1] ?? "" };
}

function joinMarkdown(before: string, after: string): string {
  const b = before.trim();
  const a = after.trim();
  if (b && a) return `${b}\n\n${a}`;
  return b || a;
}

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** Type-check known fields of the parsed value. Invalid fields are dropped with a warning. */
function normalizeMeta(raw: Record<string, unknown>, warnings: NodeWarning[]): ExperimentMeta {
  const meta: ExperimentMeta = { ...raw };
  const invalid = () => {
    if (!warnings.includes("invalid-field")) warnings.push("invalid-field");
  };

  for (const key of ["parent", "hypothesis", "change", "wandb"] as const) {
    if (key in meta && meta[key] != null && typeof meta[key] !== "string") {
      meta[key] = String(meta[key]);
    }
    if (meta[key] == null) delete meta[key];
  }

  if ("status" in meta && meta.status != null) {
    if (!isStatus(meta.status)) {
      warnings.push("invalid-status");
      delete meta.status;
    }
  } else {
    delete meta.status;
  }

  if (meta.metrics != null) {
    if (typeof meta.metrics !== "object" || Array.isArray(meta.metrics)) {
      invalid();
      delete meta.metrics;
    } else {
      const clean: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(meta.metrics as Record<string, unknown>)) {
        if (typeof v === "number" || typeof v === "string") clean[k] = v;
        else invalid();
      }
      meta.metrics = clean;
    }
  }

  if (meta.tags != null) {
    if (Array.isArray(meta.tags)) meta.tags = meta.tags.map((t) => String(t));
    else if (typeof meta.tags === "string") meta.tags = [meta.tags];
    else {
      invalid();
      delete meta.tags;
    }
  }

  return meta;
}

export function parseBody(body: string | null | undefined): ParsedBody {
  const text = body ?? "";
  const loc = locate(text);
  if (!loc) {
    return {
      meta: {},
      hasBlock: false,
      yaml: "",
      before: text,
      after: "",
      markdown: text.trim(),
      warnings: ["no-yaml-block"],
    };
  }

  const before = text.slice(0, loc.start);
  const after = text.slice(loc.end);
  const warnings: NodeWarning[] = [];
  let meta: ExperimentMeta = {};

  const doc = parseDocument(loc.yaml);
  if (doc.errors.length > 0) {
    warnings.push("yaml-parse-error");
  } else {
    const value = doc.toJS() as unknown;
    if (value == null) {
      meta = {};
    } else if (typeof value === "object" && !Array.isArray(value)) {
      meta = normalizeMeta(value as Record<string, unknown>, warnings);
    } else {
      warnings.push("yaml-parse-error");
    }
  }

  if (!warnings.includes("yaml-parse-error") && !meta.hypothesis) {
    warnings.push("missing-hypothesis");
  }

  return {
    meta,
    hasBlock: true,
    yaml: loc.yaml,
    before,
    after,
    markdown: joinMarkdown(before, after),
    warnings,
  };
}

/**
 * Changes to meta fields. `null` or `undefined` deletes the field.
 * `metrics` is merged into the existing map (set a key to `null` to delete it).
 */
export type MetaPatch = {
  [K in keyof ExperimentMeta]?: K extends "metrics"
    ? Record<string, number | string | null | undefined> | null | undefined
    : ExperimentMeta[K] | null | undefined;
};

export class PrBodyError extends Error {}

function fence(yaml: string): string {
  const y = yaml.endsWith("\n") ? yaml : `${yaml}\n`;
  return "```yaml\n" + y + "```";
}

/**
 * Rewrite only the YAML block and leave the rest of the body untouched.
 * Comments and key order are preserved. A broken YAML block is never overwritten; this throws instead.
 */
export function updateMeta(body: string | null | undefined, patch: MetaPatch): string {
  const text = body ?? "";
  const loc = locate(text);

  const doc: Document = loc ? parseDocument(loc.yaml) : new Document({});
  if (loc && doc.errors.length > 0) {
    throw new PrBodyError(t("prbody.parseError"));
  }
  if (doc.contents == null) doc.contents = new YAMLMap();
  if (!isMap(doc.contents)) {
    throw new PrBodyError(t("prbody.notMap"));
  }

  for (const [key, value] of Object.entries(patch)) {
    if (key === "metrics" && value != null) {
      if (!doc.has("metrics") || !isMap(doc.get("metrics"))) doc.set("metrics", new YAMLMap());
      for (const [mk, mv] of Object.entries(value as Record<string, unknown>)) {
        if (mv == null) doc.deleteIn(["metrics", mk]);
        else doc.setIn(["metrics", mk], mv);
      }
      continue;
    }
    if (value == null) doc.delete(key);
    else doc.set(key, value);
  }

  const block = fence(doc.toString({ lineWidth: 0 }));
  if (!loc) {
    const rest = text.trimStart();
    return rest ? `${block}\n\n${rest}` : `${block}\n`;
  }
  const trailingNewline = /\r?\n$/.test(text.slice(loc.start, loc.end)) ? "\n" : "";
  return text.slice(0, loc.start) + block + trailingNewline + text.slice(loc.end);
}

/** Keep the YAML block and replace only the human-facing markdown. */
export function replaceMarkdown(body: string | null | undefined, markdown: string): string {
  const text = body ?? "";
  const loc = locate(text);
  const md = markdown.trim();
  if (!loc) return md;
  const block = text.slice(loc.start, loc.end).replace(/\r?\n$/, "");
  return md ? `${block}\n\n${md}\n` : `${block}\n`;
}

/**
 * Headings that mark the conclusion section, in any case: `## 결론` or `## Conclusion(s)`. They are
 * part of the PR-body convention shared with the Python implementation (not UI text).
 */
const CONCLUSION_RE = /^##[ \t]+(결론|conclusions?)[ \t]*\r?\n([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/im;

/**
 * Create or replace the conclusion section. An existing `## 결론` / `## Conclusion` section keeps its
 * heading and only its text changes; otherwise a new section with `heading` goes first.
 */
export function setConclusion(body: string | null | undefined, conclusion: string, heading: string | null = "결론"): string {
  const md = parseBody(body).markdown;
  const m = CONCLUSION_RE.exec(md);
  const next = m
    ? md.slice(0, m.index) + `## ${m[1]}\n${conclusion.trim()}\n\n` + md.slice(m.index + m[0].length)
    : `## ${heading ?? "결론"}\n${conclusion.trim()}\n\n${md}`;
  return replaceMarkdown(body, next);
}

/** Text of the conclusion section (`## 결론` or `## Conclusion`), or null when there is none. */
export function getConclusion(body: string | null | undefined): string | null {
  const m = CONCLUSION_RE.exec(parseBody(body).markdown);
  return m ? m[2]!.trim() : null;
}

/**
 * Body template for a new experiment PR. The `## 결론` heading is part of the PR-body convention shared
 * with the Python implementation (not UI text), so it is not translated.
 */
export function bodyTemplate(opts: { parent: string; hypothesis: string; change?: string }): string {
  const doc = new Document({
    parent: opts.parent,
    hypothesis: opts.hypothesis,
    change: opts.change ?? "",
    metrics: {},
  });
  return `${fence(doc.toString({ lineWidth: 0 }))}\n\n## 결론\n(실험이 끝나면 작성)\n`;
}
