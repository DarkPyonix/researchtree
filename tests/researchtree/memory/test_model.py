"""Navigating, querying and checking the research memory objects (offline, from the shared fixture)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

import researchtree as rt
from researchtree import cli
from researchtree.memory import Experiment, Version, rules

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"


@pytest.fixture()
def research() -> rt.memory.Research:
    s = json.loads((FIXTURES / "tree-sample.json").read_text(encoding="utf-8"))
    return rt.from_data(s["prs"], s["repo"], tags=s["tags"], activity={int(k): v for k, v in s["activity"].items()})


def test_versions_are_islands(research) -> None:
    assert [v.name for v in research.versions] == ["v1", "v2", "v3"]
    assert research.root is research.version("v1") is research.version("research")
    v2 = research.version("v2")
    assert v2.merged.names == ["data-dedup"]
    # v2 grows from the ends of data-dedup's adopted chain (fork-a, fork-b), the last one being its parent
    assert v2.grown_from.names == ["fork-a", "fork-b"]
    assert v2.parent is research["fork-b"]
    assert v2.next is research.version("v3") and v2.previous is research.root
    # every experiment lives on exactly one island
    assert sum(len(v.experiments) for v in research.versions) == len(research)


def test_experiment_navigation(research) -> None:
    e = research["depth-lr-half"]
    assert isinstance(e, Experiment)
    assert e.branch == "experiment/depth-lr-half" and e.name == "depth-lr-half"
    assert e.parent is research["baseline-moshi"]
    assert e in e.parent.children
    assert [n.id for n in e.path][:2] == ["research", "experiment/baseline-moshi"]
    assert research.experiment(e.number) is e
    assert all(isinstance(a, (Experiment, Version)) for a in e.ancestors())
    assert research["baseline-moshi"].produces is research.version("v3")


def test_lab_note_fields(research) -> None:
    e = research["baseline-moshi"]
    assert e.hypothesis and e.metrics["val_loss"] == pytest.approx(2.84)
    assert e.conclusion and "턴테이킹" in e.conclusion
    assert "결론" in e.sections
    assert e.started.tzinfo is not None and e.ended >= e.started


def test_queries(research) -> None:
    adopted = research.experiments.where(status="adopted")
    assert adopted and all(e.status == "adopted" for e in adopted)
    best = research.experiments.best("val_loss")
    assert best is not None
    assert best.metrics["val_loss"] == min(v for v in research.experiments.metric("val_loss") if isinstance(v, (int, float)))
    ordered = research.experiments.sort_by("val_loss")
    vals = [e.metrics["val_loss"] for e in ordered.with_metric("val_loss")]
    assert vals == sorted(vals)
    assert research.search("warmup").names
    assert "val_loss" in research.metric_keys
    # aggregate over the whole history in one expression
    per_island = {v.name: len(v.experiments.where(status="rejected")) for v in research.versions}
    assert sum(per_island.values()) == len(research.experiments.where(status="rejected"))
    assert "name" in research.experiments.table("val_loss").splitlines()[0]


def test_delta_vs_parent(research) -> None:
    e = research["depth-lr-half"]
    parent = e.parent
    assert isinstance(parent, Experiment)
    if "val_loss" in e.metrics and "val_loss" in parent.metrics:
        assert e.delta("val_loss") == pytest.approx(e.metrics["val_loss"] - parent.metrics["val_loss"])
        assert e.improved("val_loss") == (e.delta("val_loss") < 0)


def test_rules_and_custom_rule(research) -> None:
    alerts = research.check()
    assert all(a.severity in rules.SEVERITY for a in alerts)
    now = datetime(2027, 1, 1, tzinfo=timezone.utc)
    stale = list(rules.stale_running(research, now=now))
    assert {a.experiment for a in stale} == {e.name for e in research.running if not e.draft}

    def no_wandb(r):
        for e in r.experiments.where(status="adopted"):
            if not e.wandb:
                yield rules.Alert("info", "no-wandb", "adopted without a W&B link", e.name)

    assert all(a.rule == "no-wandb" for a in research.check([no_wandb]))


def test_unchanged_metric_is_not_a_regression(research) -> None:
    e = next(x for x in research.experiments.where(status="adopted") if "val_loss" in x.baseline)
    parent_value = e.baseline["val_loss"]
    e._data.meta["metrics"] = {"val_loss": parent_value}
    assert e.delta("val_loss") == 0
    assert not [a for a in rules.adopted_regression(research) if a.experiment == e.name]
    e._data.meta["metrics"] = {"val_loss": parent_value + 1}
    assert [a.rule for a in rules.adopted_regression(research) if a.experiment == e.name] == ["adopted-regression"]


def test_manifest_and_describe(research) -> None:
    text = research.manifest()
    assert text.startswith("# ResearchTree memory")
    assert "v2" in text and "Drill down" in text
    assert len(text) < 4000  # small enough to keep in context
    assert "research v2" in research.version("v2").describe()
    assert research["baseline-moshi"].describe().startswith("## baseline-moshi")


def test_offline_lazy_reads_fail_clearly(research) -> None:
    with pytest.raises(RuntimeError):
        research["baseline-moshi"].commits()


def test_to_dict_is_json(research) -> None:
    data = json.loads(json.dumps(research.to_dict(), ensure_ascii=False))
    assert len(data["experiments"]) == len(research)
    assert data["versions"][0]["name"] == "v1"


def test_cli_memory(monkeypatch, capsys, research) -> None:
    monkeypatch.setattr(rt.memory, "load", lambda repo=None: research)
    assert cli.main(["memory"]) == 0
    assert "ResearchTree memory" in capsys.readouterr().out
    assert cli.main(["memory", "v2"]) == 0
    assert "research v2" in capsys.readouterr().out
    assert cli.main(["memory", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)["repo"] == research.repo
    assert cli.main(["memory", "nope"]) == 1
