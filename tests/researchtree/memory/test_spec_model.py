"""Intent and spec on the memory objects and in `researchtree spec`, with a fake GitHub source."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

import researchtree as rt
from researchtree import cli

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"

SPEC_V1 = "# Spec\n\n## Model\n> The model.\nsmall\n\n## Loss <!-- id: loss -->\n> L1.\n"
SPEC_V2 = "# Spec\n\n## Model\n> The model.\nlarge\n\n## Loss <!-- id: loss -->\n> L1.\n\n## Data\n> Deduplicated.\n"
SPEC_V3 = "# Spec\n\n## Model\n> The model.\nlarge\n\n## Objective <!-- id: loss -->\n> L1.\n\n## Data\n> Deduplicated.\n"
INTENT = "# Intent\n\n## Claims\n\n### N1. Deduplication lowers val_loss\n> Claim.\n"


class FakeSource:
    """Serves files per ref; every experiment forks at `fork`, and its head has its own files or the fork's."""

    def __init__(self, files: dict[str, dict[str, str]]) -> None:
        self.files = files

    def file_text(self, path: str, ref: str) -> str | None:
        # An experiment head without its own entry has the spec it forked from.
        files = self.files.get(ref) or (self.files["fork"] if ref.startswith("head-") else {})
        return files.get(path)

    def pull(self, number: int) -> dict:
        return {"head": {"sha": f"head-{number}"}, "base": {"sha": f"base-{number}"}}

    def merge_base(self, base: str, head: str) -> str:
        return "fork"


@pytest.fixture()
def research() -> rt.memory.Research:
    s = json.loads((FIXTURES / "tree-sample.json").read_text(encoding="utf-8"))
    r = rt.from_data(s["prs"], s["repo"], tags=s["tags"], activity={int(k): v for k, v in s["activity"].items()})
    dedup = r["data-dedup"]
    r._source = FakeSource(
        {
            "research/v1": {"SPEC.md": SPEC_V1, "INTENT.md": INTENT},
            "research/v2": {"SPEC.md": SPEC_V2, "INTENT.md": INTENT},
            "research/v3": {"SPEC.md": SPEC_V3, "INTENT.md": INTENT},
            "fork": {"SPEC.md": SPEC_V1},
            f"head-{dedup.number}": {"SPEC.md": SPEC_V2},
        }
    )
    return r


def test_version_specs_and_changes(research) -> None:
    assert research.root.ref == "research/v1"
    latest = research.spec()
    assert latest is not None and latest.ref == "research/v3" and latest["loss"].title == "Objective"
    v2 = research.version("v2")
    assert [(c.kind, c.key) for c in v2.spec_changes()] == [("changed", "model"), ("added", "data")]
    assert [(c.kind, c.key) for c in research.version("v3").spec_changes()] == [("renamed", "loss")]
    assert [(v.name, kind) for v, kind in research.spec_history("loss")] == [("v1", "added"), ("v3", "renamed")]


def test_experiment_spec_changes_compare_with_its_fork(research) -> None:
    changes = research["data-dedup"].spec_changes()
    assert [(c.kind, c.key) for c in changes] == [("changed", "model"), ("added", "data")]
    assert research["depth-lr-half"].spec_changes() == []  # a tuning experiment leaves the spec as it forked


def test_config_paths(research) -> None:
    research.config = {"spec": "docs/DESIGN.md"}
    assert research.spec_path == "docs/DESIGN.md" and research.spec() is None


def test_claims_and_cli(research) -> None:
    research._experiments["experiment/data-dedup"]._data.meta["claims"] = ["N1"]
    assert research["data-dedup"].claims == ["N1"]
    assert research.claims()["N1"].names == ["data-dedup"]

    def run(**kw) -> list[str]:
        base = dict(version=None, intent=False, summary=False, diff=None, check=False, history=None, experiment=None, claims=False)
        return cli._spec_lines(argparse.Namespace(**{**base, **kw}), research)

    assert run(summary=True) == ["Spec\n  Model — The model.\n  Objective — L1.\n  Data — Deduplicated."]
    assert run(diff="") == ["v2 → v3  (SPEC.md)", "이름 변경: Objective  [loss]"]
    assert run(claims=True) == ["N1. Deduplication lowers val_loss", f"    adopted  data-dedup  {research['data-dedup'].hypothesis}"]
    assert run(check=True) == ["문제 없음"]
    assert run(intent=True, check=True) == ["요약 줄(>) 없음: claims"]
    assert run(history="data") == ["v2       추가   합쳐진 실험: data-dedup"]
