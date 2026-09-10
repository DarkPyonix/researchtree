"""The manifest: a compact overview an agent keeps in context, with pointers to drill down."""

from __future__ import annotations

from .model import Research, _fmt, _top_keys


def manifest(research: Research, *, alerts: bool = True, max_alerts: int = 8) -> str:
    exps = research.experiments
    counts = {s: len(exps.where(status=s)) for s in ("running", "adopted", "rejected")}
    versions = research.versions
    lines = [
        f"# ResearchTree memory: {research.repo}",
        f"root `{research.root_branch}` · versions {versions[0].name}..{versions[-1].name} · "
        f"{len(exps)} experiments ({counts['adopted']} adopted, {counts['rejected']} rejected, {counts['running']} running)",
        "",
        "## Islands (one per research version)",
    ]
    for v in versions:
        island = v.experiments
        parts = [f"{len(island)} experiments"]
        if v.merged:
            parts.insert(0, f"made by {', '.join(v.merged.names)}")
        for key in _top_keys(island, 2):
            b = island.best(key)
            if b:
                parts.append(f"best {key} {_fmt(b.metrics[key])} ({b.name})")
        lines.append(f"- {v.name}" + (f" ({v.date:%Y-%m-%d})" if v.date else "") + ": " + " · ".join(parts))

    if research.running:
        lines += ["", "## Running"]
        for e in research.running:
            lines.append(f"- {e.name} (island {e.version.name}, since {e.started:%Y-%m-%d}): {e.hypothesis or e.title}")

    if alerts:
        found = research.check()
        shown = [a for a in found if a.severity != "info"][:max_alerts]
        if shown:
            lines += ["", "## Alerts"]
            lines += [f"- {a}" for a in shown]
            rest = len(found) - len(shown)
            if rest:
                lines.append(f"- … {rest} more: research.check()")

    lines += [
        "",
        "## Drill down",
        "research.version('vN').describe() · research['name'].describe() · .body / .sections / .conclusion",
        ".commits() · .comments() · .files() · research.experiments.where(status=...).best('metric') · research.search('text')",
    ]
    return "\n".join(lines)
