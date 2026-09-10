"""Executable rules over the research tree.

A rule is a plain function `(research) -> iterable of Alert`. The built-in ones below run on
`research.check()`; agents can write their own against the same objects and pass them in.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable

from .model import Experiment, Research, metric_direction

SEVERITY = ("critical", "warn", "info")
STALE_AFTER = timedelta(days=14)


@dataclass(frozen=True)
class Alert:
    severity: str  # critical | warn | info
    rule: str
    message: str
    experiment: str | None = None

    def __str__(self) -> str:
        where = f" ({self.experiment})" if self.experiment else ""
        return f"[{self.severity}/{self.rule}]{where} {self.message}"


Rule = Callable[[Research], Iterable[Alert]]


def stale_running(research: Research, now: datetime | None = None) -> Iterable[Alert]:
    """Running experiments with no work for two weeks: finish them or record why they wait."""
    now = now or datetime.now(timezone.utc)
    for e in research.running:
        idle = now - e.ended
        if idle > STALE_AFTER and not e.draft:
            yield Alert("warn", "stale-running", f"running but no work for {idle.days} days (last {e.ended:%Y-%m-%d})", e.name)


def adopted_without_metrics(research: Research) -> Iterable[Alert]:
    """An adopted experiment should say what it achieved."""
    for e in research.experiments.where(status="adopted"):
        if not e.metrics:
            yield Alert("warn", "adopted-without-metrics", "adopted with no metrics in the PR YAML", e.name)


def closed_without_conclusion(research: Research) -> Iterable[Alert]:
    """Adopted or rejected experiments keep their lesson in a conclusion section."""
    for e in research.experiments.where(status=("adopted", "rejected")):
        if not e.conclusion:
            yield Alert("info", "no-conclusion", f"{e.status} without a conclusion section", e.name)


def adopted_regression(research: Research) -> Iterable[Alert]:
    """Adopted although metrics with a known direction got worse than the parent.

    `warn` when nothing improved (every comparable metric is worse); `info` for trade-offs.
    """
    for e in research.experiments.where(status="adopted"):
        judged = {k: e.improved(k) for k in e.metrics if metric_direction(k)}
        worse = [k for k, ok in judged.items() if ok is False]
        if not worse:
            continue
        deltas = ", ".join(f"{k} {e.delta(k):+.4g}" for k in worse)
        better = [k for k, ok in judged.items() if ok]
        if better:
            yield Alert("info", "adopted-tradeoff", f"adopted with trade-offs: better {', '.join(better)}; worse {deltas}", e.name)
        else:
            yield Alert("warn", "adopted-regression", f"adopted but no metric improved on its parent: {deltas}", e.name)


def record_warnings(research: Research) -> Iterable[Alert]:
    """Problems in the lab note itself: missing YAML, parse errors, orphans, unknown versions."""
    serious = {"yaml-parse-error", "no-yaml-block", "orphan", "cycle", "unknown-version"}
    for e in research.experiments:
        for w in e.warnings:
            yield Alert("warn" if w in serious else "info", w, _WARNING_TEXT.get(w, w), e.name)


_WARNING_TEXT = {
    "no-yaml-block": "PR body has no ```yaml block",
    "yaml-parse-error": "the YAML block does not parse",
    "missing-hypothesis": "no hypothesis",
    "invalid-status": "unknown status value",
    "invalid-field": "a field has the wrong type",
    "orphan": "parent is not in the tree",
    "cycle": "parent chain loops",
    "unknown-version": "parent names a version that has no tag",
}

BUILTIN: list[Rule] = [record_warnings, stale_running, adopted_regression, adopted_without_metrics, closed_without_conclusion]


def run(research: Research, rules: Iterable[Rule] | None = None) -> list[Alert]:
    out: list[Alert] = []
    for rule in rules if rules is not None else BUILTIN:
        out.extend(rule(research))
    return sorted(out, key=lambda a: (SEVERITY.index(a.severity) if a.severity in SEVERITY else 9, a.rule, a.experiment or ""))


def for_experiment(alerts: Iterable[Alert], e: Experiment) -> list[Alert]:
    return [a for a in alerts if a.experiment == e.name]
