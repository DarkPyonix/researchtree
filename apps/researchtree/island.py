"""The ResearchIsland map: which research to show, grouped into lands, and where each one sits.

The settings live in the README.md of the account's `.researchisland` repository, in the first
```yaml block (docs/ISLAND.md). The prose around the block is for people; this module never touches
it. The viewer reads the same file, so both must agree on what a valid map is.

Unknown keys and broken entries are dropped with a warning rather than emptying the map: a map that
half works is better than a blank sea.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from io import StringIO
from typing import Any, Iterable

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedSeq
from ruamel.yaml.error import YAMLError

CONFIG_REPO = ".researchisland"
CONFIG_PATH = "README.md"
PROFILE_PATH = "PROFILE.md"
DEFAULT_ROOT = "research"
DEFAULT_PREFIX = "experiment/"

_REPO_RE = re.compile(r"^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$")
_FENCE_RE = re.compile(r"^```[ \t]*ya?ml[ \t]*$", re.IGNORECASE)


@dataclass
class Research:
    """One repository on the map."""

    repo: str
    at: tuple[int, int] = (0, 0)
    root: str = DEFAULT_ROOT
    prefix: str = DEFAULT_PREFIX

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"repo": self.repo, "at": _flow(self.at)}
        if self.root != DEFAULT_ROOT:
            out["root"] = self.root
        if self.prefix != DEFAULT_PREFIX:
            out["prefix"] = self.prefix
        return out


@dataclass
class Land:
    """A group of research reached through a portal: a project, in map terms."""

    name: str
    at: tuple[int, int] = (0, 0)
    intro: str | None = None
    repos: list[Research] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"name": self.name, "at": _flow(self.at)}
        if self.intro:
            out["intro"] = self.intro
        out["repos"] = [r.to_dict() for r in self.repos]
        return out


@dataclass
class IslandMap:
    islands: list[Land] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def research(self) -> list[Research]:
        return [r for land in self.islands for r in land.repos]

    def find(self, repo: str) -> Research | None:
        return next((r for r in self.research() if r.repo == repo), None)

    def to_dict(self) -> dict[str, Any]:
        return {"islands": [land.to_dict() for land in self.islands]}


def _flow(pair: tuple[int, int]) -> CommentedSeq:
    """`at: [0, 1]` on one line, the way a person would write a coordinate."""
    seq = CommentedSeq(pair)
    seq.fa.set_flow_style()
    return seq


def _yaml() -> YAML:
    y = YAML()
    y.preserve_quotes = True
    y.default_flow_style = False
    return y


def yaml_block(text: str) -> str | None:
    """The first ```yaml block of a Markdown document, or None when it has none."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if _FENCE_RE.match(line.strip()):
            body: list[str] = []
            for rest in lines[i + 1 :]:
                if rest.strip().startswith("```"):
                    return "\n".join(body)
                body.append(rest)
            return "\n".join(body)
    return None


def _coords(value: Any, where: str, warnings: list[str]) -> tuple[int, int]:
    if isinstance(value, (list, tuple)) and len(value) == 2 and all(isinstance(n, int) for n in value):
        return (int(value[0]), int(value[1]))
    if value is not None:
        warnings.append(f"{where}: at must be two whole numbers, e.g. [0, 1]")
    return (0, 0)


def parse_map(text: str) -> IslandMap:
    """Read the settings out of a README. Anything unreadable becomes a warning, not an exception."""
    warnings: list[str] = []
    block = yaml_block(text)
    if block is None:
        return IslandMap(warnings=["no ```yaml block in the settings file"])
    try:
        data = _yaml().load(StringIO(block))
    except YAMLError as e:
        return IslandMap(warnings=[f"the yaml block could not be read: {e}"])
    if not isinstance(data, dict):
        return IslandMap(warnings=["the yaml block is not key: value pairs"])

    raw_islands = data.get("islands")
    if not isinstance(raw_islands, list):
        return IslandMap(warnings=["islands: must be a list of lands"])

    seen: set[str] = set()
    islands: list[Land] = []
    for i, raw in enumerate(raw_islands):
        where = f"islands[{i}]"
        if not isinstance(raw, dict):
            warnings.append(f"{where}: not a land")
            continue
        name = str(raw.get("name") or "").strip()
        if not name:
            warnings.append(f"{where}: name is required")
            continue
        land = Land(name=name, at=_coords(raw.get("at"), where, warnings), intro=(str(raw["intro"]).strip() if raw.get("intro") else None))
        for j, item in enumerate(raw.get("repos") or []):
            spot = f"{where}.repos[{j}]"
            if not isinstance(item, dict):
                warnings.append(f"{spot}: not a research entry")
                continue
            repo = str(item.get("repo") or "").strip()
            if not _REPO_RE.match(repo):
                warnings.append(f"{spot}: repo must be owner/name")
                continue
            if repo in seen:
                warnings.append(f"{spot}: {repo} is already on the map")
                continue
            seen.add(repo)
            land.repos.append(
                Research(
                    repo=repo,
                    at=_coords(item.get("at"), spot, warnings),
                    root=str(item.get("root") or DEFAULT_ROOT).strip() or DEFAULT_ROOT,
                    prefix=str(item.get("prefix") or DEFAULT_PREFIX).strip() or DEFAULT_PREFIX,
                )
            )
        if not land.repos:
            warnings.append(f"{where}: {name} has no research on it")
        islands.append(land)
    return IslandMap(islands=islands, warnings=warnings)


def dump_map(island_map: IslandMap) -> str:
    """The yaml block body for a map, without the fences."""
    out = StringIO()
    _yaml().dump(island_map.to_dict(), out)
    return out.getvalue().rstrip("\n")


def write_map(text: str, island_map: IslandMap) -> str:
    """Put the map back into a README, replacing its first ```yaml block and keeping the prose."""
    block = dump_map(island_map)
    lines = text.split("\n")
    for i, line in enumerate(lines):
        if _FENCE_RE.match(line.strip()):
            for j in range(i + 1, len(lines)):
                if lines[j].strip().startswith("```"):
                    return "\n".join([*lines[: i + 1], *block.split("\n"), *lines[j:]])
            break
    head = text.rstrip("\n")
    intro = head + "\n\n" if head else ""
    return f"{intro}```yaml\n{block}\n```\n"


def new_readme(user: str, island_map: IslandMap) -> str:
    """A settings README for an account that has none yet: the map, and a line saying what this is."""
    return (
        f"# {user}'s ResearchIsland\n\n"
        "The map below decides which research this account shows, how the repositories are grouped, "
        "and where each one sits. Everything outside the block is for people to read.\n\n"
        f"Open it: https://darkpyonix.github.io/researchtree/?user={user}\n\n"
        f"```yaml\n{dump_map(island_map)}\n```\n"
    )


def next_spot(taken: Iterable[tuple[int, int]]) -> tuple[int, int]:
    """A free place on a small grid, filling rows of three."""
    used = set(taken)
    for i in range(0, 999):
        spot = (i % 3, i // 3)
        if spot not in used:
            return spot
    return (0, 0)
