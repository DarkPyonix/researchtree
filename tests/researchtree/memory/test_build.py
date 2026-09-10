"""The Python tree builder must match the TypeScript one on the shared fixture."""

from __future__ import annotations

import json
from pathlib import Path

from researchtree.memory.build import build_tree

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def load_sample() -> dict:
    return json.loads((FIXTURES / "tree-sample.json").read_text(encoding="utf-8"))


def canonical(sample: dict) -> dict:
    tree = build_tree(
        sample["prs"],
        sample["repo"],
        root=sample["config"]["root"],
        prefix=sample["config"]["prefix"],
        tags=sample["tags"],
        activity={int(k): v for k, v in sample["activity"].items()},
    )
    ms = lambda dt: int(round(dt.timestamp() * 1000))  # noqa: E731
    return {
        "rootVersion": tree.root_version,
        "rootChildren": tree.root_children,
        "nodes": {
            n.id: {
                "parent": n.parent,
                "status": n.status,
                "version": n.version,
                "produces": n.produces,
                "depth": n.depth,
                "orphan": n.orphan,
                "warnings": sorted(n.warnings),
                "children": n.children,
                "started": ms(n.started_at),
                "lastWork": ms(n.last_work_at),
            }
            for n in sorted(tree.nodes.values(), key=lambda n: n.id)
        },
        "versions": {
            v.id: {"name": v.name, "parent": v.parent, "mergedFrom": v.merged_from, "grownFrom": v.grown_from, "children": v.children, "depth": v.depth}
            for v in tree.versions.values()
        },
    }


def test_matches_typescript_fixture() -> None:
    expected = json.loads((FIXTURES / "tree-expected.json").read_text(encoding="utf-8"))
    assert canonical(load_sample()) == expected


def test_yaml_parent_on_unknown_version_warns() -> None:
    sample = load_sample()
    pr = dict(sample["prs"][0])
    pr["head"] = {"ref": "experiment/ghost", "sha": "g"}
    pr["number"] = 999
    pr["body"] = "```yaml\nparent: research@v9\nhypothesis: x\n```\n"
    tree = build_tree([*sample["prs"], pr], sample["repo"], tags=sample["tags"])
    node = tree.nodes["experiment/ghost"]
    assert node.parent == "research"
    assert "unknown-version" in node.warnings


def test_other_prefix_and_hidden_bases() -> None:
    prs = [
        {
            "number": 1,
            "title": "a",
            "state": "open",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "head": {"ref": "exp/a", "sha": "1"},
            "base": {"ref": "main"},
            "body": "```yaml\nhypothesis: h\n```",
        },
        {
            "number": 2,
            "title": "b",
            "state": "open",
            "created_at": "2026-01-03T00:00:00Z",
            "updated_at": "2026-01-04T00:00:00Z",
            "head": {"ref": "exp/b", "sha": "2"},
            "base": {"ref": "trunk"},
            "body": "```yaml\nhypothesis: h\n```",
        },
    ]
    tree = build_tree(prs, "o/r", root="trunk", prefix="exp/")
    assert list(tree.nodes) == ["exp/b"]  # base main is not research: hidden
    assert tree.root_children == ["exp/b"]
