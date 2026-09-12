import { isMap, parseDocument } from "yaml";

/**
 * Intent and spec documents: the repo config file, splitting a spec into sections, assembling
 * included files, and section-level changes between two versions of a spec.
 * The Python port is apps/researchtree/memory/spec.py; both must pass tests/fixtures/spec-cases.json.
 */

/** Repository settings shared by the whole team, read from the root branch. */
export const REPO_CONFIG_PATH = ".researchtree";
/** What the file used to be called. Repositories that still use it are read the same way. */
export const REPO_CONFIG_PATH_OLD = ".researchtree.yml";
/** Where to look for the repository's settings, in the order they win. */
export const REPO_CONFIG_PATHS = [REPO_CONFIG_PATH, REPO_CONFIG_PATH_OLD] as const;
export const DEFAULT_SPEC_PATH = "SPEC.md";
export const DEFAULT_INTENT_PATH = "INTENT.md";

/** A section longer than this (own lines, without children) is flagged by checkSpec. */
export const SECTION_LINE_BUDGET = 40;
const MAX_INCLUDE_DEPTH = 5;

export interface RepoConfig {
  /** Root branch of the research tree. The file sits on the default branch, so it can name it. */
  root?: string;
  prefix?: string;
  spec?: string;
  intent?: string;
}

export type RepoConfigWarning =
  | { code: "invalid-yaml" }
  | { code: "not-mapping" }
  | { code: "invalid-branch"; key: "root" | "prefix" }
  | { code: "invalid-path"; key: "spec" | "intent" }
  | { code: "unknown-key"; key: string };

export interface SpecSection {
  /**
   * Stable identity: the explicit id, else the parent's key + "/" + the title's slug (a level-1
   * parent is left out). "" for text before the first heading.
   */
  key: string;
  /** Set with `<!-- id: name -->` on the heading line or the line right after it. */
  id: string | null;
  /** 1-6 for headings, 0 for text before the first heading. */
  level: number;
  title: string;
  /** Text of the `>` quote that opens the section, if any. */
  summary: string | null;
  /** The section's own text (up to the next heading of any level), without the id comment. */
  body: string;
  parent: string | null;
}

export interface Spec {
  /** Entry file the spec was assembled from. */
  path: string;
  /** Title of the first level-1 heading. */
  title: string | null;
  /** Assembled Markdown (includes expanded). */
  text: string;
  sections: SpecSection[];
  /** Included paths that could not be read (or were not allowed). */
  missing: string[];
}

export type SectionChangeKind = "added" | "removed" | "changed" | "renamed";

export interface SectionChange {
  key: string;
  kind: SectionChangeKind;
  /** Title after the change (before, for a removed section). */
  title: string;
  before: SpecSection | null;
  after: SpecSection | null;
}

export type SpecIssue =
  | { kind: "missing-include"; path: string }
  | { kind: "no-summary"; key: string }
  | { kind: "too-long"; key: string; lines: number };

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^\s{0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const ID_RE = /<!--\s*id:\s*([A-Za-z0-9._-]+)\s*-->/;
const ID_LINE_RE = /^\s*<!--\s*id:\s*([A-Za-z0-9._-]+)\s*-->\s*$/;
const INCLUDE_RE = /^\s*<!--\s*include:\s*(\S+?)\s*-->\s*$/;

/** Tracks fenced code blocks so headings and comments inside them are ignored. */
class Fences {
  private open: string | null = null;

  /** Returns true when the line is inside a fence (fence lines themselves included). */
  step(line: string): boolean {
    const m = FENCE_RE.exec(line);
    if (this.open === null) {
      if (m) {
        this.open = m[1]!;
        return true;
      }
      return false;
    }
    if (m && m[1]![0] === this.open[0] && m[1]!.length >= this.open.length && line.trim() === m[1]) this.open = null;
    return true;
  }
}

/** Lowercase, and every run of characters other than letters and digits becomes one `-`. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function trimBlock(lines: string[]): string {
  const out = lines.map((l) => l.replace(/\s+$/, ""));
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

function summaryOf(body: string): string | null {
  const lines = body.split("\n");
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0 || !lines[first]!.trimStart().startsWith(">")) return null;
  const quote: string[] = [];
  for (const l of lines.slice(first)) {
    const s = l.trimStart();
    if (!s.startsWith(">")) break;
    quote.push(s.replace(/^>\s?/, "").trim());
  }
  const text = quote.filter(Boolean).join(" ").trim();
  return text || null;
}

/** Split Markdown into sections, one per ATX heading (headings inside code fences do not count). */
export function parseSpec(text: string): SpecSection[] {
  type Raw = { level: number; title: string; id: string | null; lines: string[]; fresh: boolean };
  const raws: Raw[] = [{ level: 0, title: "", id: null, lines: [], fresh: false }];
  const fences = new Fences();
  for (const line of text.split(/\r?\n/)) {
    const cur = raws[raws.length - 1]!;
    if (fences.step(line)) {
      cur.lines.push(line);
      cur.fresh = false;
      continue;
    }
    const m = HEADING_RE.exec(line);
    if (m) {
      let title = (m[2] ?? "").replace(/[ \t]+#+$/, "").replace(/^#+$/, "");
      const id = ID_RE.exec(title);
      if (id) title = title.replace(ID_RE, "");
      raws.push({ level: m[1]!.length, title: title.trim(), id: id ? id[1]! : null, lines: [], fresh: true });
      continue;
    }
    const idLine = cur.fresh && cur.id === null ? ID_LINE_RE.exec(line) : null;
    if (idLine) cur.id = idLine[1]!;
    else cur.lines.push(line);
    cur.fresh = false;
  }

  const sections: SpecSection[] = [];
  const seen = new Set<string>();
  const stack: SpecSection[] = [];
  for (const r of raws) {
    const body = trimBlock(r.lines);
    if (r.level === 0) {
      if (body) sections.push({ key: "", id: null, level: 0, title: "", summary: summaryOf(body), body, parent: null });
      continue;
    }
    while (stack.length && stack[stack.length - 1]!.level >= r.level) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    // The document title (level 1) is left out of child keys, so renaming it keeps every section's history.
    const prefix = parent && parent.level >= 2 ? `${parent.key}/` : "";
    let key = r.id ?? `${prefix}${slugify(r.title) || "section"}`;
    if (seen.has(key)) {
      let n = 2;
      while (seen.has(`${key}-${n}`)) n++;
      key = `${key}-${n}`;
    }
    seen.add(key);
    const section: SpecSection = { key, id: r.id, level: r.level, title: r.title, summary: summaryOf(body), body, parent: parent?.key ?? null };
    sections.push(section);
    stack.push(section);
  }
  return sections;
}

/** Resolve `rel` against directory `dir` inside the repository. Null when it leaves the repository or is not a plain path. */
export function joinPath(dir: string, rel: string): string | null {
  if (!rel || rel.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(rel)) return null;
  const parts = rel.startsWith("/") ? [] : dir.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.length ? parts.join("/") : null;
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/**
 * Read the entry file and expand `<!-- include: path -->` lines (relative to the including file,
 * outside code fences, at most five levels deep). Null when the entry file does not exist.
 */
export async function loadSpec(entry: string, read: (path: string) => Promise<string | null>): Promise<Spec | null> {
  const missing: string[] = [];
  const expand = async (path: string, stack: string[]): Promise<string | null> => {
    const text = await read(path);
    if (text === null) return null;
    const out: string[] = [];
    const fences = new Fences();
    for (const line of text.split(/\r?\n/)) {
      const m = fences.step(line) ? null : INCLUDE_RE.exec(line);
      if (!m) {
        out.push(line);
        continue;
      }
      const target = joinPath(dirname(path), m[1]!);
      const sub = target && !stack.includes(target) && stack.length < MAX_INCLUDE_DEPTH ? await expand(target, [...stack, target]) : null;
      if (sub === null) {
        missing.push(target ?? m[1]!);
        out.push(line);
      } else out.push(sub.replace(/\n$/, ""));
    }
    return out.join("\n");
  };
  const text = await expand(entry, [entry]);
  if (text === null) return null;
  const sections = parseSpec(text);
  return { path: entry, title: sections.find((s) => s.level === 1)?.title ?? null, text, sections, missing };
}

/** Section-level changes from `before` to `after` (null before = everything is new). Order: after's order, then removed sections. */
export function diffSpecs(before: readonly SpecSection[] | null, after: readonly SpecSection[]): SectionChange[] {
  const old = new Map((before ?? []).map((s) => [s.key, s]));
  const now = new Set(after.map((s) => s.key));
  const changes: SectionChange[] = [];
  for (const a of after) {
    const b = old.get(a.key);
    if (!b) changes.push({ key: a.key, kind: "added", title: a.title, before: null, after: a });
    else if (b.body !== a.body) changes.push({ key: a.key, kind: "changed", title: a.title, before: b, after: a });
    else if (b.title !== a.title) changes.push({ key: a.key, kind: "renamed", title: a.title, before: b, after: a });
  }
  for (const b of before ?? []) {
    if (!now.has(b.key)) changes.push({ key: b.key, kind: "removed", title: b.title, before: b, after: null });
  }
  return changes;
}

/** In which versions (oldest first) a section appeared, changed, was renamed or was removed. */
export function sectionHistory(
  versions: readonly { name: string; sections: readonly SpecSection[] | null }[],
  key: string,
): { version: string; kind: SectionChangeKind }[] {
  const out: { version: string; kind: SectionChangeKind }[] = [];
  let prev: readonly SpecSection[] | null = null;
  for (const v of versions) {
    const cur = v.sections ?? [];
    const change = diffSpecs(prev, cur).find((c) => c.key === key);
    if (change) out.push({ version: v.name, kind: change.kind });
    prev = cur;
  }
  return out;
}

/** Readability checks: unresolved includes, sections without a summary line, sections over the line budget. */
export function checkSpec(spec: Pick<Spec, "sections" | "missing">): SpecIssue[] {
  const issues: SpecIssue[] = spec.missing.map((path) => ({ kind: "missing-include", path }));
  for (const s of spec.sections) {
    if (s.level >= 2 && s.summary === null) issues.push({ kind: "no-summary", key: s.key });
    const lines = s.body ? s.body.split("\n").length : 0;
    if (lines > SECTION_LINE_BUDGET) issues.push({ kind: "too-long", key: s.key, lines });
  }
  return issues;
}

/** Headings and their summary lines only: the whole design on one page. */
export function specSummary(spec: Pick<Spec, "sections">): string {
  const out: string[] = [];
  for (const s of spec.sections) {
    if (s.level === 0) continue;
    const pad = "  ".repeat(Math.max(0, s.level - 1));
    out.push(s.summary ? `${pad}${s.title} — ${s.summary}` : `${pad}${s.title}`);
  }
  return out.join("\n");
}

const PREFIX_RE = /^(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._\-/]+\/$/;
const BRANCH_RE = /^(?!\/)(?!.*\/\/)(?!.*\.\.)(?!.*\/$)[A-Za-z0-9._\-/]+$/;

/** Parse `.researchtree`. Unknown keys are reported but otherwise ignored; bad values are dropped. */
export function parseRepoConfig(text: string): { config: RepoConfig; warnings: RepoConfigWarning[] } {
  const warnings: RepoConfigWarning[] = [];
  const config: RepoConfig = {};
  const doc = parseDocument(text);
  if (doc.errors.length) return { config, warnings: [{ code: "invalid-yaml" }] };
  const data: unknown = doc.toJS();
  if (data === null || data === undefined) return { config, warnings };
  if (!isMap(doc.contents) || typeof data !== "object" || Array.isArray(data)) return { config, warnings: [{ code: "not-mapping" }] };
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === "root") {
      const root = typeof value === "string" ? value.trim() : "";
      if (root && BRANCH_RE.test(root)) config.root = root;
      else warnings.push({ code: "invalid-branch", key: "root" });
    } else if (key === "prefix") {
      let p = typeof value === "string" ? value.trim() : "";
      if (p && !p.endsWith("/")) p += "/";
      if (PREFIX_RE.test(p)) config.prefix = p;
      else warnings.push({ code: "invalid-branch", key: "prefix" });
    } else if (key === "spec" || key === "intent") {
      const path = typeof value === "string" ? joinPath("", value.trim()) : null;
      if (path) config[key] = path;
      else warnings.push({ code: "invalid-path", key });
    } else warnings.push({ code: "unknown-key", key });
  }
  if (config.root && config.prefix && config.root.startsWith(config.prefix)) {
    delete config.root;
    warnings.push({ code: "invalid-branch", key: "root" });
  }
  return { config, warnings };
}

/** Line-level diff for showing one section's change. Falls back to delete-all / add-all for very long text. */
export function lineDiff(before: string, after: string): { op: " " | "+" | "-"; text: string }[] {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  if (a.length * b.length > 250_000) return [...a.map((text) => ({ op: "-" as const, text })), ...b.map((text) => ({ op: "+" as const, text }))];
  const n = a.length;
  const m = b.length;
  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  const out: { op: " " | "+" | "-"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: "-", text: a[i++]! });
    else out.push({ op: "+", text: b[j++]! });
  }
  while (i < n) out.push({ op: "-", text: a[i++]! });
  while (j < m) out.push({ op: "+", text: b[j++]! });
  return out;
}
