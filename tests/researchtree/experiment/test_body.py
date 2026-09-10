from __future__ import annotations

import json
from pathlib import Path

import pytest

from researchtree.experiment import body as prbody

CASES_FILE = Path(__file__).resolve().parents[2] / "fixtures" / "prbody-cases.json"

CASES = json.loads(CASES_FILE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES["parse"], ids=[c["name"] for c in CASES["parse"]])
def test_parse_fixture(case):
    parsed = prbody.parse(case["body"])
    assert parsed.meta == case["meta"]
    assert parsed.markdown == case["markdown"]
    assert parsed.warnings == case["warnings"]


@pytest.mark.parametrize("case", CASES["update"], ids=[c["name"] for c in CASES["update"]])
def test_update_fixture(case):
    assert prbody.update(case["body"], case["patch"]) == case["expected"]


def test_update_refuses_broken_yaml():
    with pytest.raises(prbody.PrBodyError):
        prbody.update("```yaml\nhypothesis: [x\n```\n", {"status": "adopted"})


def test_update_refuses_non_mapping():
    with pytest.raises(prbody.PrBodyError):
        prbody.update("```yaml\n- a\n- b\n```\n", {"status": "adopted"})


def test_update_keeps_unknown_fields_comments_and_markdown():
    body = "intro\n\n```yaml\nhypothesis: h  # why\nseed: 42\n```\n\n## 메모\nkeep me\n"
    out = prbody.update(body, {"metrics": {"acc": 0.9}})
    assert out == "intro\n\n```yaml\nhypothesis: h  # why\nseed: 42\nmetrics:\n  acc: 0.9\n```\n\n## 메모\nkeep me\n"


def test_update_metric_delete():
    out = prbody.update("```yaml\nhypothesis: h\nmetrics:\n  a: 1\n  b: 2\n```\n", {"metrics": {"a": None}})
    assert out == "```yaml\nhypothesis: h\nmetrics:\n  b: 2\n```\n"


def test_invalid_metrics_and_number_coercion():
    parsed = prbody.parse("```yaml\nhypothesis: 3\nmetrics:\n  a: [1]\n  b: 2\n```")
    assert parsed.meta == {"hypothesis": "3", "metrics": {"b": 2}}
    assert parsed.warnings == ["invalid-field"]


def test_set_conclusion_inserts_and_replaces():
    body = "```yaml\nhypothesis: h\n```\n\n## 메모\nm\n"
    once = prbody.set_conclusion(body, "기각")
    assert once == "```yaml\nhypothesis: h\n```\n\n## 결론\n기각\n\n## 메모\nm\n"
    twice = prbody.set_conclusion(once, "채택")
    assert twice == "```yaml\nhypothesis: h\n```\n\n## 결론\n채택\n\n## 메모\nm\n"


def test_replace_markdown_without_block():
    assert prbody.replace_markdown("old", "  new  ") == "new"
