"""Build the research tree from PRs and version tags.

A line-by-line port of `buildTree` in apps/core/src/tree.ts; both follow docs/CONVENTIONS.md and must
pass tests/fixtures/tree-expected.json. Change the fixture first, then both implementations.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Iterable, Mapping

from ..experiment import body as prbody

VERSION_RE = re.compile(r"^v\d+(?:\.\d+)*$")
DEFAULT_ROOT = "research"
DEFAULT_PREFIX = "experiment/"


def parse_version_tag(root: str, tag: str) -> str | None:
    """`research/v2` -> `v2`. Version tags are namespaced by the root branch so they never clash
    with release tags such as `v2` on `main`; any other tag -> None."""
    prefix = f"{root}/"
    if not tag.startswith(prefix):
        return None
    name = tag[len(prefix) :]
    return name if VERSION_RE.match(name) else None


def version_tag(root: str, name: str) -> str:
    return f"{root}/{name}"


def version_key(name: str) -> tuple[int, ...]:
    return tuple(int(p) for p in name[1:].split("."))


def version_id(root: str, name: str) -> str:
    return f"{root}@{name}"


def parse_time(value: Any) -> datetime | None:
    """ISO timestamp (GitHub) or YAML date -> aware UTC datetime; anything else -> None."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if not isinstance(value, str) or not re.match(r"^\d{4}-\d{2}-\d{2}", value):
        return None
    try:
        dt = datetime.fromisoformat(value if len(value) > 10 else f"{value}T00:00:00+00:00")
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def season_of(dt: datetime) -> str:
    """Northern-hemisphere season: spring Mar-May, summer Jun-Aug, autumn Sep-Nov, winter Dec-Feb."""
    m = dt.month
    if 3 <= m <= 5:
        return "spring"
    if 6 <= m <= 8:
        return "summer"
    if 9 <= m <= 11:
        return "autumn"
    return "winter"


@dataclass
class NodeData:
    id: str
    parent: str
    pr: dict[str, Any]
    status: str
    meta: dict[str, Any]
    body_md: str
    raw_body: str
    warnings: list[str]
    started_at: datetime
    last_work_at: datetime
    orphan: bool = False
    depth: int = 0
    children: list[str] = field(default_factory=list)
    version: str | None = None
    produces: str | None = None


@dataclass
class VersionData:
    id: str
    name: str
    sha: str
    date: datetime
    parent: str
    merged_from: list[str] = field(default_factory=list)
    grown_from: list[str] = field(default_factory=list)
    children: list[str] = field(default_factory=list)
    depth: int = 0


@dataclass
class TreeData:
    repo: str
    root: str
    prefix: str
    root_version: str | None
    root_children: list[str]
    nodes: dict[str, NodeData]
    versions: dict[str, VersionData]

    def parent_of(self, id: str) -> str | None:
        if id in self.nodes:
            return self.nodes[id].parent
        if id in self.versions:
            return self.versions[id].parent
        return None

    def children_of(self, id: str) -> list[str]:
        if id == self.root:
            return self.root_children
        if id in self.nodes:
            return self.nodes[id].children
        if id in self.versions:
            return self.versions[id].children
        return []


def _status(pr: Mapping[str, Any], override: str | None) -> str:
    if override:
        return override
    if pr.get("merged_at"):
        return "adopted"
    if pr.get("state") == "closed":
        return "rejected"
    return "running"


def build_tree(
    prs: Iterable[Mapping[str, Any]],
    repo: str,
    *,
    root: str = DEFAULT_ROOT,
    prefix: str = DEFAULT_PREFIX,
    tags: Iterable[Mapping[str, Any]] = (),
    activity: Mapping[int, Mapping[str, Any]] | None = None,
) -> TreeData:
    """`prs`: GitHub PR objects. `tags`: {name, sha, date} with names like `research/v2`.
    `activity`: PR number -> {first, last} commit dates."""
    activity = activity or {}
    tag_list = [
        {"name": name, "sha": t.get("sha", ""), "date": parse_time(t.get("date")) or datetime.min.replace(tzinfo=timezone.utc)}
        for t in tags
        if (name := parse_version_tag(root, str(t.get("name", ""))))
    ]
    tag_list.sort(key=lambda t: version_key(t["name"]))
    first = tag_list[0] if tag_list else None
    versions: dict[str, VersionData] = {}
    for t in tag_list[1:]:
        vid = version_id(root, t["name"])
        versions[vid] = VersionData(vid, t["name"], t["sha"], t["date"], root)

    def by_name(name: str) -> str | None:
        if first and name == first["name"]:
            return root
        vid = version_id(root, name)
        return vid if vid in versions else None

    def version_at(when: datetime) -> tuple[str, str | None]:
        pick = first
        for t in tag_list:
            if t["date"] <= when:
                pick = t
        return ((by_name(pick["name"]) or root) if pick else root), (pick["name"] if pick else None)

    chosen: dict[str, tuple[Mapping[str, Any], prbody.ParsedBody]] = {}
    for pr in prs:
        head = pr["head"]["ref"]
        if not head.startswith(prefix):
            continue
        parsed = prbody.parse(pr.get("body"))
        base = pr["base"]["ref"]
        if not (base == root or base.startswith(prefix) or parsed.meta.get("parent")):
            continue
        prev = chosen.get(head)
        if prev is None or pr["created_at"] > prev[0]["created_at"]:
            chosen[head] = (pr, parsed)

    nodes: dict[str, NodeData] = {}
    for nid, (pr, parsed) in chosen.items():
        act = activity.get(int(pr["number"])) or {}
        meta = parsed.meta
        started = parse_time(meta.get("started")) or parse_time(act.get("first")) or parse_time(pr["created_at"])
        last = (
            parse_time(meta.get("ended"))
            or parse_time(act.get("last"))
            or parse_time(pr.get("merged_at"))
            or parse_time(pr.get("closed_at"))
            or parse_time(pr.get("updated_at"))
            or started
        )
        assert started is not None and last is not None
        user = pr.get("user") or {}
        node = NodeData(
            id=nid,
            parent=str(meta.get("parent") or pr["base"]["ref"]),
            pr={
                "number": pr["number"],
                "url": pr.get("html_url", ""),
                "title": pr.get("title", ""),
                "author": user.get("login", "unknown"),
                "state": pr.get("state", "open"),
                "merged": bool(pr.get("merged_at")),
                "draft": bool(pr.get("draft")),
                "reviewers": len(pr.get("requested_reviewers") or []) + len(pr.get("requested_teams") or []),
                "created_at": pr["created_at"],
                "updated_at": pr.get("updated_at"),
                "closed_at": pr.get("closed_at"),
                "merged_at": pr.get("merged_at"),
                "merge_sha": pr.get("merge_commit_sha"),
                "head_sha": pr["head"].get("sha", ""),
                "base_ref": pr["base"]["ref"],
            },
            status=_status(pr, meta.get("status")),
            meta=meta,
            body_md=parsed.markdown,
            raw_body=pr.get("body") or "",
            warnings=list(parsed.warnings),
            started_at=started,
            last_work_at=max(last, started),
        )

        at = node.parent[len(root) + 1 :] if node.parent.startswith(f"{root}@") else None
        if at is not None:
            vid = by_name(at)
            node.version = at
            if vid:
                node.parent = vid
            else:
                node.parent = root
                node.warnings.append("unknown-version")
        elif node.parent == root:
            vid, name = version_at(started)
            node.parent = vid
            node.version = name
        nodes[nid] = node

    def exists(id: str) -> bool:
        return id == root or id in nodes or id in versions

    for node in nodes.values():
        if node.parent == node.id or not exists(node.parent):
            node.orphan = True
            node.warnings.append("orphan")
            node.parent = root

    def research_rooted(n: NodeData) -> bool:
        return n.parent == root or n.parent in versions or n.pr["base_ref"] == root

    ordered = list(versions.values())
    for node in nodes.values():
        merged_at = parse_time(node.pr["merged_at"])
        if not node.pr["merged"] or merged_at is None or not research_rooted(node):
            continue
        v = next((x for x in ordered if node.pr["merge_sha"] and x.sha == node.pr["merge_sha"]), None)
        if v is None:
            v = next((x for x in ordered if x.date >= merged_at), None)
        if v is None:
            continue
        v.merged_from.append(node.id)
        node.produces = v.id

    def parent_of(id: str) -> str | None:
        if id in nodes:
            return nodes[id].parent
        if id in versions:
            return versions[id].parent
        return None

    def reaches(start: str | None, target: str) -> bool:
        seen: set[str] = set()
        cur = start
        while cur and cur != root:
            if cur == target or cur in seen:
                return True
            seen.add(cur)
            cur = parent_of(cur)
        return False

    def merged_key(a: str) -> str:
        return nodes[a].pr["merged_at"] or ""

    def adopted_ends(id: str, seen: set[str]) -> list[str]:
        """Ends of the adopted chain under an experiment: the next version grows from there."""
        if id in seen:
            return []
        seen.add(id)
        kids = sorted((n.id for n in nodes.values() if n.parent == id and n.pr["merged"] and n.pr["base_ref"] == id), key=merged_key)
        return [e for k in kids for e in adopted_ends(k, seen)] if kids else [id]

    for i, v in enumerate(ordered):
        prev = root if i == 0 else ordered[i - 1].id
        v.merged_from.sort(key=merged_key)
        seen: set[str] = set()
        v.grown_from = [e for m in v.merged_from for e in adopted_ends(m, seen)]
        last_id = v.grown_from[-1] if v.grown_from else None
        v.parent = last_id if last_id and not reaches(last_id, v.id) else prev

    for node in nodes.values():
        if reaches(node.parent, node.id):
            node.warnings.append("cycle")
            node.orphan = True
            node.parent = root

    def time_of(id: str) -> datetime:
        if id in nodes:
            return nodes[id].started_at
        if id in versions:
            return versions[id].date
        return datetime.min.replace(tzinfo=timezone.utc)

    root_children: list[str] = []

    def attach(id: str, parent: str) -> None:
        if parent == root:
            root_children.append(id)
        elif parent in nodes:
            nodes[parent].children.append(id)
        elif parent in versions:
            versions[parent].children.append(id)

    for node in nodes.values():
        attach(node.id, node.parent)
    for v in versions.values():
        attach(v.id, v.parent)
    for n in nodes.values():
        n.children.sort(key=time_of)
    for v in versions.values():
        v.children.sort(key=time_of)
    root_children.sort(key=time_of)

    def assign_depth(id: str, depth: int) -> None:
        n = nodes.get(id) or versions.get(id)
        if n is None:
            return
        n.depth = depth
        for c in n.children:
            assign_depth(c, depth + 1)

    for id in root_children:
        assign_depth(id, 1)

    return TreeData(repo, root, prefix, first["name"] if first else None, root_children, nodes, versions)
