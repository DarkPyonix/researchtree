"""The Python spec rules must match the TypeScript ones on the shared fixture."""

from __future__ import annotations

import json
from pathlib import Path

from researchtree.memory import spec

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


def _canonical() -> dict:
    cases = json.loads((FIXTURES / "spec-cases.json").read_text(encoding="utf-8"))
    load = []
    for c in cases["load"]:
        s = spec.load_spec(c["entry"], lambda p, files=c["files"]: files.get(p))
        load.append(
            {"name": c["name"], "spec": s and {"title": s.title, "text": s.text, "keys": [x.key for x in s.sections], "missing": s.missing}}
        )
    return {
        "slugify": [spec.slugify(t) for t in cases["slugify"]],
        "parse": [{"name": c["name"], "sections": [s.to_dict() for s in spec.parse_spec(c["text"])]} for c in cases["parse"]],
        "load": load,
        "diff": [
            {
                "name": c["name"],
                "changes": [
                    {"key": x.key, "kind": x.kind, "title": x.title}
                    for x in spec.diff_specs(None if c["before"] is None else spec.parse_spec(c["before"]), spec.parse_spec(c["after"]))
                ],
            }
            for c in cases["diff"]
        ],
        "history": [
            {
                "name": c["name"],
                "history": spec.section_history(
                    [(v["name"], None if v["text"] is None else spec.parse_spec(v["text"])) for v in c["versions"]], c["key"]
                ),
            }
            for c in cases["history"]
        ],
        "check": [{"name": c["name"], "issues": spec.check_spec(spec.parse_spec(c["text"]), c["missing"])} for c in cases["check"]],
        "config": [
            {"name": c["name"], "config": cfg, "warnings": warns}
            for c in cases["config"]
            for cfg, warns in [spec.parse_repo_config(c["text"])]
        ],
    }


def test_matches_typescript_fixture() -> None:
    expected = json.loads((FIXTURES / "spec-expected.json").read_text(encoding="utf-8"))
    got = _canonical()
    for part in expected:
        assert got[part] == expected[part], part


def test_spec_object_helpers() -> None:
    s = spec.load_spec("SPEC.md", {"SPEC.md": "# Spec\n\n## Model\n> The model.\nbody\n"}.get)
    assert s is not None
    assert s["model"].summary == "The model." and s["Model"].key == "model"
    assert s.summary() == "Spec\n  Model — The model."
    assert [c.kind for c in s.diff(None)] == ["added", "added"]
