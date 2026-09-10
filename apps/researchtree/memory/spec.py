"""Intent and spec documents: repo config, sections, includes and section-level changes.

Python port of apps/core/src/spec.ts; both must pass tests/fixtures/spec-cases.json.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

from ruamel.yaml import YAML
from ruamel.yaml.error import YAMLError

REPO_CONFIG_PATH = ".researchtree.yml"
DEFAULT_SPEC_PATH = "SPEC.md"
DEFAULT_INTENT_PATH = "INTENT.md"
SECTION_LINE_BUDGET = 40
_MAX_INCLUDE_DEPTH = 5

_FENCE_RE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
_HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$")
_ID_RE = re.compile(r"<!--\s*id:\s*([A-Za-z0-9._-]+)\s*-->")
_ID_LINE_RE = re.compile(r"^\s*<!--\s*id:\s*([A-Za-z0-9._-]+)\s*-->\s*$")
_INCLUDE_RE = re.compile(r"^\s*<!--\s*include:\s*(\S+?)\s*-->\s*$")
_PREFIX_RE = re.compile(r"^(?!/)(?!.*//)(?!.*\.\.)[A-Za-z0-9._\-/]+/$")
_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)


@dataclass(frozen=True)
class Section:
    key: str
    id: str | None
    level: int
    title: str
    summary: str | None
    body: str
    parent: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "id": self.id,
            "level": self.level,
            "title": self.title,
            "summary": self.summary,
            "body": self.body,
            "parent": self.parent,
        }


@dataclass(frozen=True)
class SectionChange:
    key: str
    kind: str  # added | removed | changed | renamed
    title: str
    before: Section | None
    after: Section | None

    def __str__(self) -> str:
        return f"{self.kind}: {self.title or '(머리말)'}"


@dataclass
class Spec:
    """An assembled spec document at one git ref."""

    path: str
    title: str | None
    text: str
    sections: list[Section]
    missing: list[str] = field(default_factory=list)
    ref: str | None = None

    def __getitem__(self, key: str) -> Section:
        """By key (`vocoder/sample-rate`) or exact title."""
        for s in self.sections:
            if s.key == key:
                return s
        for s in self.sections:
            if s.title == key:
                return s
        raise KeyError(f"no section {key!r}")

    def __iter__(self):
        return iter(self.sections)

    def __len__(self) -> int:
        return len(self.sections)

    def summary(self) -> str:
        return spec_summary(self.sections)

    def diff(self, before: Spec | None) -> list[SectionChange]:
        """Changes from `before` to this spec."""
        return diff_specs(before.sections if before else None, self.sections)

    def check(self) -> list[dict[str, Any]]:
        return check_spec(self.sections, self.missing)

    def __repr__(self) -> str:
        return f"Spec({self.path!r}, {len(self.sections)} sections)"


class _Fences:
    def __init__(self) -> None:
        self.open: str | None = None

    def step(self, line: str) -> bool:
        m = _FENCE_RE.match(line)
        if self.open is None:
            if m:
                self.open = m.group(1)
                return True
            return False
        if m and m.group(1)[0] == self.open[0] and len(m.group(1)) >= len(self.open) and line.strip() == m.group(1):
            self.open = None
        return True


def slugify(title: str) -> str:
    """Lowercase, and every run of characters other than letters and digits becomes one `-`."""
    return re.sub(r"[\W_]+", "-", title.lower()).strip("-")


def _trim_block(lines: list[str]) -> str:
    out = [line.rstrip() for line in lines]
    while out and out[0] == "":
        out.pop(0)
    while out and out[-1] == "":
        out.pop()
    return "\n".join(out)


def _summary_of(body: str) -> str | None:
    lines = body.split("\n")
    first = next((i for i, line in enumerate(lines) if line.strip()), None)
    if first is None or not lines[first].lstrip().startswith(">"):
        return None
    quote: list[str] = []
    for line in lines[first:]:
        s = line.lstrip()
        if not s.startswith(">"):
            break
        quote.append(re.sub(r"^>\s?", "", s).strip())
    text = " ".join(q for q in quote if q).strip()
    return text or None


def _split_lines(text: str) -> list[str]:
    return re.split(r"\r?\n", text)


def parse_spec(text: str) -> list[Section]:
    """Split Markdown into sections, one per ATX heading (headings inside code fences do not count)."""
    raws: list[dict[str, Any]] = [{"level": 0, "title": "", "id": None, "lines": [], "fresh": False}]
    fences = _Fences()
    for line in _split_lines(text):
        cur = raws[-1]
        if fences.step(line):
            cur["lines"].append(line)
            cur["fresh"] = False
            continue
        m = _HEADING_RE.match(line)
        if m:
            title = re.sub(r"[ \t]+#+$", "", m.group(2) or "")
            title = re.sub(r"^#+$", "", title)
            mid = _ID_RE.search(title)
            if mid:
                title = _ID_RE.sub("", title)
            raws.append({"level": len(m.group(1)), "title": title.strip(), "id": mid.group(1) if mid else None, "lines": [], "fresh": True})
            continue
        id_line = _ID_LINE_RE.match(line) if cur["fresh"] and cur["id"] is None else None
        if id_line:
            cur["id"] = id_line.group(1)
        else:
            cur["lines"].append(line)
        cur["fresh"] = False

    sections: list[Section] = []
    seen: set[str] = set()
    stack: list[Section] = []
    for r in raws:
        body = _trim_block(r["lines"])
        if r["level"] == 0:
            if body:
                sections.append(Section("", None, 0, "", _summary_of(body), body, None))
            continue
        while stack and stack[-1].level >= r["level"]:
            stack.pop()
        parent = stack[-1] if stack else None
        # The document title (level 1) is left out of child keys, so renaming it keeps every section's history.
        prefix = f"{parent.key}/" if parent and parent.level >= 2 else ""
        key = r["id"] or f"{prefix}{slugify(r['title']) or 'section'}"
        if key in seen:
            n = 2
            while f"{key}-{n}" in seen:
                n += 1
            key = f"{key}-{n}"
        seen.add(key)
        section = Section(key, r["id"], r["level"], r["title"], _summary_of(body), body, parent.key if parent else None)
        sections.append(section)
        stack.append(section)
    return sections


def join_path(dir: str, rel: str) -> str | None:
    """Resolve `rel` against `dir` inside the repository; None when it leaves it or is not a plain path."""
    if not rel or "\\" in rel or _SCHEME_RE.match(rel):
        return None
    parts = [] if rel.startswith("/") else [p for p in dir.split("/") if p]
    for seg in rel.split("/"):
        if seg in ("", "."):
            continue
        if seg == "..":
            if not parts:
                return None
            parts.pop()
        else:
            parts.append(seg)
    return "/".join(parts) if parts else None


def _dirname(path: str) -> str:
    i = path.rfind("/")
    return "" if i < 0 else path[:i]


def load_spec(entry: str, read: Callable[[str], str | None]) -> Spec | None:
    """Read the entry file and expand `<!-- include: path -->` lines. None when the entry file does not exist."""
    missing: list[str] = []

    def expand(path: str, stack: list[str]) -> str | None:
        text = read(path)
        if text is None:
            return None
        out: list[str] = []
        fences = _Fences()
        for line in _split_lines(text):
            m = None if fences.step(line) else _INCLUDE_RE.match(line)
            if not m:
                out.append(line)
                continue
            target = join_path(_dirname(path), m.group(1))
            sub = expand(target, [*stack, target]) if target and target not in stack and len(stack) < _MAX_INCLUDE_DEPTH else None
            if sub is None:
                missing.append(target or m.group(1))
                out.append(line)
            else:
                out.append(sub[:-1] if sub.endswith("\n") else sub)
        return "\n".join(out)

    text = expand(entry, [entry])
    if text is None:
        return None
    sections = parse_spec(text)
    title = next((s.title for s in sections if s.level == 1), None)
    return Spec(entry, title, text, sections, missing)


def diff_specs(before: Sequence[Section] | None, after: Sequence[Section]) -> list[SectionChange]:
    """Section-level changes from `before` to `after` (None before = everything is new)."""
    old = {s.key: s for s in before or []}
    now = {s.key for s in after}
    changes: list[SectionChange] = []
    for a in after:
        b = old.get(a.key)
        if b is None:
            changes.append(SectionChange(a.key, "added", a.title, None, a))
        elif b.body != a.body:
            changes.append(SectionChange(a.key, "changed", a.title, b, a))
        elif b.title != a.title:
            changes.append(SectionChange(a.key, "renamed", a.title, b, a))
    for b in before or []:
        if b.key not in now:
            changes.append(SectionChange(b.key, "removed", b.title, b, None))
    return changes


def section_history(versions: Iterable[tuple[str, Sequence[Section] | None]], key: str) -> list[dict[str, str]]:
    """In which versions (oldest first) a section appeared, changed, was renamed or was removed."""
    out: list[dict[str, str]] = []
    prev: Sequence[Section] | None = None
    for name, sections in versions:
        cur = sections or []
        change = next((c for c in diff_specs(prev, cur) if c.key == key), None)
        if change:
            out.append({"version": name, "kind": change.kind})
        prev = cur
    return out


def check_spec(sections: Sequence[Section], missing: Sequence[str] = ()) -> list[dict[str, Any]]:
    """Readability checks: unresolved includes, sections without a summary line, sections over the line budget."""
    issues: list[dict[str, Any]] = [{"kind": "missing-include", "path": p} for p in missing]
    for s in sections:
        if s.level >= 2 and s.summary is None:
            issues.append({"kind": "no-summary", "key": s.key})
        lines = len(s.body.split("\n")) if s.body else 0
        if lines > SECTION_LINE_BUDGET:
            issues.append({"kind": "too-long", "key": s.key, "lines": lines})
    return issues


def spec_summary(sections: Sequence[Section]) -> str:
    """Headings and their summary lines only: the whole design on one page."""
    out = []
    for s in sections:
        if s.level == 0:
            continue
        pad = "  " * max(0, s.level - 1)
        out.append(f"{pad}{s.title} — {s.summary}" if s.summary else f"{pad}{s.title}")
    return "\n".join(out)


def parse_repo_config(text: str) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Parse `.researchtree.yml`. Unknown keys are reported but otherwise ignored; bad values are dropped."""
    config: dict[str, str] = {}
    warnings: list[dict[str, str]] = []
    try:
        data = YAML(typ="safe").load(text)
    except YAMLError:
        return config, [{"code": "invalid-yaml"}]
    if data is None:
        return config, warnings
    if not isinstance(data, dict):
        return config, [{"code": "not-mapping"}]
    for key, value in data.items():
        if key == "prefix":
            p = value.strip() if isinstance(value, str) else ""
            if p and not p.endswith("/"):
                p += "/"
            if _PREFIX_RE.match(p):
                config["prefix"] = p
            else:
                warnings.append({"code": "invalid-prefix", "key": "prefix"})
        elif key in ("spec", "intent"):
            path = join_path("", value.strip()) if isinstance(value, str) else None
            if path:
                config[key] = path
            else:
                warnings.append({"code": "invalid-path", "key": key})
        else:
            warnings.append({"code": "unknown-key", "key": str(key)})
    return config, warnings
