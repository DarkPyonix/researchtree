"""The bundled agent skill (skills/researchtree/SKILL.md) and its installation into a repository."""

from __future__ import annotations

from importlib.resources import files
from pathlib import Path

NAME = "researchtree"
# Where coding agents look for project skills, relative to the repository root.
TARGETS = {"claude": Path(".claude/skills"), "agents": Path(".agents/skills")}


def text() -> str:
    """Contents of the SKILL.md shipped with this package."""
    return files(__package__).joinpath("skills", NAME, "SKILL.md").read_text(encoding="utf-8")


def default_targets(root: Path) -> list[str]:
    """The agent folders the repository already has (.claude, .agents); both when it has neither."""
    found = [k for k, rel in TARGETS.items() if (root / rel.parts[0]).is_dir()]
    return found or list(TARGETS)


def install(root: Path, targets: list[str]) -> list[tuple[Path, str]]:
    """Write SKILL.md under each target. Returns (path, "installed" | "updated" | "unchanged")."""
    content = text()
    results: list[tuple[Path, str]] = []
    for key in targets:
        path = root / TARGETS[key] / NAME / "SKILL.md"
        old = path.read_text(encoding="utf-8") if path.is_file() else None
        if old == content:
            results.append((path, "unchanged"))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        results.append((path, "installed" if old is None else "updated"))
    return results
