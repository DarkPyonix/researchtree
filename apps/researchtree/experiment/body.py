"""Parse and losslessly rewrite the PR body YAML block. Same rules as `apps/core/src/prbody.ts`."""

from __future__ import annotations

import io
import math
import re
from dataclasses import dataclass, field
from typing import Any

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.error import YAMLError

STATUSES = ("running", "adopted", "rejected")

# First ```yaml fenced block in the body. Opening and closing fences must each be on their own line.
FENCE_RE = re.compile(r"^```ya?ml[ \t]*\r?\n(.*?)^```[ \t]*(?:\r?\n|$)", re.M | re.S)


class PrBodyError(Exception):
    pass


@dataclass
class ParsedBody:
    meta: dict[str, Any]
    has_block: bool
    yaml: str
    before: str
    after: str
    markdown: str
    warnings: list[str] = field(default_factory=list)


def _yaml() -> YAML:
    y = YAML()  # round-trip: keeps comments and key order
    y.preserve_quotes = True
    y.width = 1 << 30  # never fold long lines (TS lineWidth: 0)
    y.indent(mapping=2, sequence=4, offset=2)
    y.allow_unicode = True
    return y


def _locate(body: str) -> tuple[int, int, str] | None:
    m = FENCE_RE.search(body)
    return (m.start(), m.end(), m.group(1)) if m else None


def _join_markdown(before: str, after: str) -> str:
    b, a = before.strip(), after.strip()
    if b and a:
        return f"{b}\n\n{a}"
    return b or a


def _to_plain(v: Any) -> Any:
    if isinstance(v, dict):
        return {str(k): _to_plain(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_to_plain(x) for x in v]
    if isinstance(v, bool):
        return bool(v)
    if isinstance(v, int):
        return int(v)
    if isinstance(v, float):
        return float(v)
    if isinstance(v, str):
        return str(v)
    return v


def _js_str(v: Any) -> str:
    """String conversion matching JS `String(v)`."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        if math.isfinite(v) and v == int(v):
            return str(int(v))
        return "NaN" if math.isnan(v) else ("Infinity" if v == math.inf else "-Infinity" if v == -math.inf else repr(v))
    if isinstance(v, dict):
        return "[object Object]"
    if isinstance(v, list):
        return ",".join("" if x is None else _js_str(x) for x in v)
    return str(v)


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _normalize_meta(raw: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    """Type-check known fields. Invalid fields are dropped with a warning."""
    meta = dict(raw)

    def invalid() -> None:
        if "invalid-field" not in warnings:
            warnings.append("invalid-field")

    for key in ("parent", "hypothesis", "change", "wandb"):
        if meta.get(key) is not None and not isinstance(meta[key], str):
            meta[key] = _js_str(meta[key])
        if key in meta and meta[key] is None:
            del meta[key]

    if meta.get("status") is not None:
        if meta["status"] not in STATUSES:
            warnings.append("invalid-status")
            del meta["status"]
    else:
        meta.pop("status", None)

    if meta.get("metrics") is not None:
        if not isinstance(meta["metrics"], dict):
            invalid()
            del meta["metrics"]
        else:
            clean: dict[str, Any] = {}
            for k, v in meta["metrics"].items():
                if _is_number(v) or isinstance(v, str):
                    clean[k] = v
                else:
                    invalid()
            meta["metrics"] = clean

    if meta.get("tags") is not None:
        tags = meta["tags"]
        if isinstance(tags, list):
            meta["tags"] = [_js_str(t) if t is not None else "null" for t in tags]
        elif isinstance(tags, str):
            meta["tags"] = [tags]
        else:
            invalid()
            del meta["tags"]

    return meta


def parse(body: str | None) -> ParsedBody:
    text = body or ""
    loc = _locate(text)
    if not loc:
        return ParsedBody({}, False, "", text, "", text.strip(), ["no-yaml-block"])

    start, end, raw = loc
    before, after = text[:start], text[end:]
    warnings: list[str] = []
    meta: dict[str, Any] = {}

    try:
        value = _to_plain(_yaml().load(raw))
    except YAMLError:
        warnings.append("yaml-parse-error")
    else:
        if value is None:
            meta = {}
        elif isinstance(value, dict):
            meta = _normalize_meta(value, warnings)
        else:
            warnings.append("yaml-parse-error")

    if "yaml-parse-error" not in warnings and not meta.get("hypothesis"):
        warnings.append("missing-hypothesis")

    return ParsedBody(meta, True, raw, before, after, _join_markdown(before, after), warnings)


def _fence(yaml_text: str) -> str:
    y = yaml_text if yaml_text.endswith("\n") else yaml_text + "\n"
    return "```yaml\n" + y + "```"


def _dump(doc: Any) -> str:
    buf = io.StringIO()
    _yaml().dump(doc, buf)
    return buf.getvalue()


def update(body: str | None, patch: dict[str, Any]) -> str:
    """
    Modify only the YAML block and leave the rest of the body untouched. A None value deletes the field.
    `metrics` is merged into the existing map (set a key to None to delete it).
    A broken YAML block is never overwritten; PrBodyError is raised instead.
    """
    text = body or ""
    loc = _locate(text)

    doc: Any = CommentedMap()
    if loc:
        try:
            doc = _yaml().load(loc[2])
        except YAMLError as e:
            raise PrBodyError("PR 본문의 YAML 블록을 파싱할 수 없어 수정하지 않았습니다.") from e
    if doc is None:
        doc = CommentedMap()
    if not isinstance(doc, dict):
        raise PrBodyError("PR 본문의 YAML 블록이 key: value 형식이 아닙니다.")

    for key, value in patch.items():
        if key == "metrics" and value is not None:
            if not isinstance(doc.get("metrics"), dict):
                doc["metrics"] = CommentedMap()
            metrics = doc["metrics"]
            for mk, mv in value.items():
                if mv is None:
                    metrics.pop(mk, None)
                else:
                    metrics[mk] = mv
            continue
        if value is None:
            doc.pop(key, None)
        else:
            doc[key] = _to_yaml_node(value)

    block = _fence(_dump(doc))
    if not loc:
        rest = text.lstrip()
        return f"{block}\n\n{rest}" if rest else f"{block}\n"
    start, end, _ = loc
    trailing = "\n" if re.search(r"\r?\n$", text[start:end]) else ""
    return text[:start] + block + trailing + text[end:]


def _to_yaml_node(v: Any) -> Any:
    if isinstance(v, dict) and not isinstance(v, CommentedMap):
        m = CommentedMap()
        for k, x in v.items():
            m[k] = _to_yaml_node(x)
        return m
    if isinstance(v, (list, tuple)) and not isinstance(v, CommentedSeq):
        return CommentedSeq(_to_yaml_node(x) for x in v)
    return v


def replace_markdown(body: str | None, markdown: str) -> str:
    """Keep the YAML block and replace only the human-readable markdown."""
    text = body or ""
    loc = _locate(text)
    md = markdown.strip()
    if not loc:
        return md
    block = re.sub(r"\r?\n$", "", text[loc[0] : loc[1]])
    return f"{block}\n\n{md}\n" if md else f"{block}\n"


# Headings that mark the conclusion section, in any case: `## 결론` or `## Conclusion(s)`. Part of the
# PR-body convention shared with the TypeScript implementation.
CONCLUSION_RE = re.compile(r"^##[ \t]+(결론|conclusions?)[ \t]*\r?\n(.*?)(?=^##[ \t]|\Z)", re.M | re.S | re.I)


def set_conclusion(body: str | None, conclusion: str, heading: str | None = "결론") -> str:
    """Create or replace the conclusion section. An existing `## 결론` / `## Conclusion` section keeps
    its heading and only its text changes; otherwise a new section with `heading` goes first."""
    md = parse(body).markdown
    m = CONCLUSION_RE.search(md)
    if m:
        nxt = md[: m.start()] + f"## {m.group(1)}\n{conclusion.strip()}\n\n" + md[m.end() :]
    else:
        nxt = f"## {heading or '결론'}\n{conclusion.strip()}\n\n" + md
    return replace_markdown(body, nxt)


def get_conclusion(body: str | None) -> str | None:
    """Text of the conclusion section (`## 결론` or `## Conclusion`), or None."""
    m = CONCLUSION_RE.search(parse(body).markdown)
    return m.group(2).strip() if m else None
