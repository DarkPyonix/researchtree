"""Typed, navigable view of a research tree: the objects an agent codes against.

`Research` -> `Version` (one island per research version) -> `Experiment` -> body sections, commits,
comments. Everything above the body comes from one fetch; commits, comments and files are loaded
lazily from GitHub on first access.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any, Callable, Iterable, Iterator, Sequence, SupportsIndex, overload

from .build import TreeData, season_of
from .spec import DEFAULT_INTENT_PATH, DEFAULT_SPEC_PATH, SectionChange, Spec, diff_specs, load_spec, section_history

if TYPE_CHECKING:
    from .source import Source

Metric = float | int | str

_LOWER = re.compile(r"loss|wer|cer|error|latency|ppl|perplexity|_ms$|fid", re.I)
_HIGHER = re.compile(r"acc|score|bleu|f1|mos|precision|recall|auc|rouge|win", re.I)
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$", re.M)


def metric_direction(key: str) -> str | None:
    """'lower' / 'higher' is better, guessed from the key name (same rule as the viewer)."""
    if _LOWER.search(key):
        return "lower"
    if _HIGHER.search(key):
        return "higher"
    return None


def _number(v: Metric | None) -> float | None:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def sections(markdown: str) -> dict[str, str]:
    """Markdown split by headings: {heading text: body}. Text before the first heading is under ''."""
    out: dict[str, str] = {}
    matches = list(_HEADING.finditer(markdown))
    if not matches:
        return {"": markdown.strip()} if markdown.strip() else {}
    if markdown[: matches[0].start()].strip():
        out[""] = markdown[: matches[0].start()].strip()
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
        out[m.group(2).strip()] = markdown[m.end() : end].strip()
    return out


@dataclass(frozen=True)
class Commit:
    sha: str
    message: str
    author: str
    date: datetime | None

    @property
    def title(self) -> str:
        return self.message.splitlines()[0] if self.message else ""


@dataclass(frozen=True)
class Comment:
    author: str
    body: str
    date: datetime | None


@dataclass(frozen=True)
class FileChange:
    path: str
    status: str
    additions: int
    deletions: int


class Experiments(list["Experiment"]):
    """A list of experiments with query helpers. Plain list operations and comprehensions work too."""

    def where(self, predicate: Callable[[Experiment], bool] | None = None, **fields: Any) -> Experiments:
        """Filter by a predicate and/or attribute equality, e.g. `.where(status="adopted", version="v3")`."""

        def ok(e: Experiment) -> bool:
            if predicate and not predicate(e):
                return False
            for k, want in fields.items():
                got = getattr(e, k)
                got = got.name if isinstance(got, Version) else got
                if isinstance(want, (list, tuple, set)):
                    if got not in want:
                        return False
                elif got != want:
                    return False
            return True

        return Experiments(e for e in self if ok(e))

    def with_metric(self, key: str) -> Experiments:
        return Experiments(e for e in self if _number(e.metrics.get(key)) is not None)

    def sort_by(self, key: str | Callable[[Experiment], Any], *, reverse: bool = False) -> Experiments:
        """Sort by a metric name (missing values last) or by any key function."""
        if callable(key):
            return Experiments(sorted(self, key=key, reverse=reverse))
        present = self.with_metric(key)
        rest = [e for e in self if e not in present]
        return Experiments(sorted(present, key=lambda e: _number(e.metrics[key]) or 0.0, reverse=reverse) + rest)

    def best(self, key: str, *, lower: bool | None = None) -> Experiment | None:
        """Best experiment by a metric; direction guessed from the name unless `lower` is given."""
        cands = self.with_metric(key)
        if not cands:
            return None
        if lower is None:
            lower = metric_direction(key) != "higher"
        pick = min if lower else max
        return pick(cands, key=lambda e: _number(e.metrics[key]) or 0.0)

    def search(self, text: str) -> Experiments:
        """Case-insensitive search in name, title, hypothesis, change, tags and body."""
        q = text.lower()
        return Experiments(e for e in self if q in e.searchable)

    @property
    def names(self) -> list[str]:
        return [e.name for e in self]

    def metric(self, key: str) -> list[Metric | None]:
        return [e.metrics.get(key) for e in self]

    def table(self, *metrics: str) -> str:
        """Plain-text table: name, status, version, and the given metrics."""
        rows = [["name", "status", "version", *metrics]]
        for e in self:
            rows.append([e.name, e.status, e.version.name if e.version else "", *(_fmt(e.metrics.get(m)) for m in metrics)])
        widths = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
        return "\n".join("  ".join(c.ljust(w) for c, w in zip(r, widths)).rstrip() for r in rows)

    @overload
    def __getitem__(self, i: SupportsIndex) -> Experiment: ...
    @overload
    def __getitem__(self, i: slice) -> Experiments: ...
    def __getitem__(self, i: Any) -> Any:
        got = super().__getitem__(i)
        return Experiments(got) if isinstance(i, slice) else got

    def __repr__(self) -> str:
        return f"Experiments({self.names})"


def _fmt(v: Metric | None) -> str:
    if v is None:
        return "-"
    if isinstance(v, float):
        return f"{v:.4g}"
    return str(v)


class Node:
    """Common navigation for versions and experiments."""

    research: Research
    id: str

    @property
    def parent(self) -> Node | None:
        pid = self.research._tree.parent_of(self.id)
        return self.research._node(pid) if pid is not None else None

    @property
    def children(self) -> list[Node]:
        return [self.research._node(c) for c in self.research._tree.children_of(self.id)]

    def ancestors(self) -> list[Node]:
        """Parents up to the root, nearest first (versions on the way included)."""
        out: list[Node] = []
        cur = self.parent
        while cur is not None and cur not in out:
            out.append(cur)
            cur = cur.parent
        return out

    def descendants(self) -> list[Node]:
        out: list[Node] = []
        stack = list(reversed(self.children))
        while stack:
            n = stack.pop()
            out.append(n)
            stack.extend(reversed(n.children))
        return out

    @property
    def path(self) -> list[Node]:
        """From the root down to this node."""
        return [*reversed(self.ancestors()), self]


class Version(Node):
    """A research version and its island: the experiments that grow from it."""

    def __init__(self, research: Research, id: str, name: str | None, sha: str, date: datetime | None) -> None:
        self.research = research
        self.id = id
        self.name = name or research.root_branch
        self.sha = sha
        self.date = date

    @property
    def is_root(self) -> bool:
        return self.id == self.research.root_branch

    @property
    def merged(self) -> Experiments:
        """Adopted experiments merged into research to make this version (oldest first)."""
        v = self.research._tree.versions.get(self.id)
        return Experiments(self.research._experiment(i) for i in (v.merged_from if v else []))

    @property
    def grown_from(self) -> Experiments:
        """Ends of the adopted chains merged into this version; it grows from the last one."""
        v = self.research._tree.versions.get(self.id)
        return Experiments(self.research._experiment(i) for i in (v.grown_from if v else []))

    @property
    def experiments(self) -> Experiments:
        """Every experiment on this version's island (grows from this version, not from a later one)."""
        return Experiments(e for e in self.research.experiments if e.version is self)

    @property
    def started_here(self) -> Experiments:
        return Experiments(c for c in self.children if isinstance(c, Experiment))

    @property
    def next(self) -> Version | None:
        vs = self.research.versions
        i = vs.index(self)
        return vs[i + 1] if i + 1 < len(vs) else None

    @property
    def previous(self) -> Version | None:
        vs = self.research.versions
        i = vs.index(self)
        return vs[i - 1] if i > 0 else None

    @property
    def metrics(self) -> dict[str, Metric]:
        """A version stands for the metrics of the experiment it grows from (end of the last merged chain)."""
        ends = self.grown_from or self.merged
        return dict(ends[-1].metrics) if ends else {}

    @property
    def ref(self) -> str:
        """Git ref this version's files are read at: its tag, or the root branch when the repo has no tags."""
        if self.is_root and not self.research._tree.root_version:
            return self.research.root_branch
        return self.tag

    def spec(self) -> Spec | None:
        """The spec document as it was at this version (includes expanded); None if the repo has none."""
        return self.research.spec_at(self.ref)

    def spec_changes(self) -> list[SectionChange]:
        """Spec sections added, changed, renamed or removed since the previous version."""
        cur = self.spec()
        prev = self.previous.spec() if self.previous else None
        return diff_specs(prev.sections if prev else None, cur.sections if cur else [])

    @property
    def tag(self) -> str:
        """Git tag of this version: `research/v2` (namespaced by the root branch)."""
        from .build import version_tag

        return version_tag(self.research.root_branch, self.name)

    def describe(self) -> str:
        """One screen about this island: what made it, what grew from it, best results."""
        exps = self.experiments
        lines = [f"## {self.research.root_branch} {self.name}" + (f" ({self.date:%Y-%m-%d})" if self.date else "")]
        if self.merged:
            lines.append("made by: " + ", ".join(e.name for e in self.merged))
        counts = {s: len(exps.where(status=s)) for s in ("running", "adopted", "rejected")}
        lines.append(f"island: {len(exps)} experiments ({counts['adopted']} adopted, {counts['rejected']} rejected, {counts['running']} running)")
        for key in _top_keys(exps, 4):
            b = exps.best(key)
            if b:
                lines.append(f"best {key}: {_fmt(b.metrics[key])} ({b.name})")
        for e in exps:
            lines.append(f"- {e.name} [{e.status}] {e.hypothesis or e.title}")
        nxt = self.next
        if nxt:
            lines.append(f"next: {nxt.name}")
        return "\n".join(lines)

    def __repr__(self) -> str:
        return f"Version({self.name})"


class Experiment(Node):
    """One experiment: one branch, one PR, and its lab note."""

    def __init__(self, research: Research, id: str) -> None:
        self.research = research
        self.id = id
        self._data = research._tree.nodes[id]

    # identity -------------------------------------------------------------------------------------
    @property
    def branch(self) -> str:
        return self.id

    @property
    def name(self) -> str:
        p = self.research.prefix
        return self.id[len(p) :] if self.id.startswith(p) else self.id

    @property
    def number(self) -> int:
        return int(self._data.pr["number"])

    @property
    def url(self) -> str:
        return str(self._data.pr["url"])

    @property
    def title(self) -> str:
        return str(self._data.pr["title"])

    @property
    def author(self) -> str:
        return str(self._data.pr["author"])

    # lab note fields ------------------------------------------------------------------------------
    @property
    def status(self) -> str:
        return self._data.status

    @property
    def draft(self) -> bool:
        return bool(self._data.pr["draft"])

    @property
    def state(self) -> str:
        """The PR's state on GitHub: `open` or `closed` (merged PRs are closed too)."""
        return str(self._data.pr["state"])

    @property
    def finished(self) -> bool:
        """Work is over: the PR was merged or closed."""
        return self.state == "closed"

    @property
    def meta(self) -> dict[str, Any]:
        """The PR body's YAML block (unknown fields kept)."""
        return self._data.meta

    @property
    def hypothesis(self) -> str | None:
        return self.meta.get("hypothesis")

    @property
    def change(self) -> str | None:
        return self.meta.get("change")

    @property
    def metrics(self) -> dict[str, Metric]:
        return dict(self.meta.get("metrics") or {})

    @property
    def wandb(self) -> str | None:
        return self.meta.get("wandb")

    @property
    def tags(self) -> list[str]:
        return list(self.meta.get("tags") or [])

    @property
    def warnings(self) -> list[str]:
        return list(self._data.warnings)

    @property
    def started(self) -> datetime:
        return self._data.started_at

    @property
    def ended(self) -> datetime:
        """Last work on the branch (YAML `ended`, else the last commit, else PR dates)."""
        return self._data.last_work_at

    @property
    def season(self) -> str:
        return season_of(self.ended)

    @property
    def merged_at(self) -> datetime | None:
        from .build import parse_time

        return parse_time(self._data.pr["merged_at"])

    # tree -----------------------------------------------------------------------------------------
    @property
    def version(self) -> Version:
        """The island this experiment lives on: its nearest version ancestor (or the root)."""
        for n in self.ancestors():
            if isinstance(n, Version):
                return n
        return self.research.root

    @property
    def produces(self) -> Version | None:
        """The version this experiment's merge into research made, if any."""
        v = self._data.produces
        return self.research._version(v) if v else None

    @property
    def siblings(self) -> Experiments:
        p = self.parent
        kids = p.children if p is not None else []
        return Experiments(c for c in kids if isinstance(c, Experiment) and c is not self)

    @property
    def depth(self) -> int:
        return self._data.depth

    # body -----------------------------------------------------------------------------------------
    @property
    def body(self) -> str:
        """The lab note: PR body markdown without the YAML block."""
        return self._data.body_md

    @property
    def sections(self) -> dict[str, str]:
        return sections(self.body)

    def section(self, *names: str) -> str | None:
        """First section whose heading matches one of the names (case-insensitive)."""
        wanted = [n.lower() for n in names]
        for heading, text in self.sections.items():
            if heading.lower() in wanted:
                return text
        return None

    @property
    def conclusion(self) -> str | None:
        return self.section("결론", "conclusion", "conclusions", "result", "results")

    @property
    def searchable(self) -> str:
        parts = [self.name, self.title, self.hypothesis or "", self.change or "", " ".join(self.tags), self.body]
        return "\n".join(parts).lower()

    # comparisons ----------------------------------------------------------------------------------
    @property
    def baseline(self) -> dict[str, Metric]:
        """Metrics this experiment is compared against: its parent's (a version counts as its last merge)."""
        p = self.parent
        if isinstance(p, (Experiment, Version)):
            return p.metrics
        return {}

    def delta(self, key: str) -> float | None:
        """This metric minus the parent's; None if either is missing or not numeric."""
        a, b = _number(self.metrics.get(key)), _number(self.baseline.get(key))
        return None if a is None or b is None else a - b

    def improved(self, key: str) -> bool | None:
        """Whether the metric moved the good way vs the parent (None when unknown)."""
        d, direction = self.delta(key), metric_direction(key)
        if d is None or direction is None:
            return None
        return d < 0 if direction == "lower" else d > 0

    # lazy GitHub reads ----------------------------------------------------------------------------
    def commits(self) -> list[Commit]:
        return self.research._source_or_raise().commits(self.number)

    def comments(self) -> list[Comment]:
        return self.research._source_or_raise().comments(self.number)

    def files(self) -> list[FileChange]:
        return self.research._source_or_raise().files(self.number)

    @property
    def claims(self) -> list[str]:
        """Intent claim ids this experiment tests (YAML `claims:`), e.g. ["N1"]."""
        raw = self.meta.get("claims")
        items = raw if isinstance(raw, list) else [raw] if raw not in (None, "") else []
        return [str(c).strip() for c in items if str(c).strip()]

    def spec_changes(self) -> list[SectionChange]:
        """Spec sections this experiment's branch adds, changes, renames or removes, compared with the
        commit it forked from. Rejected experiments show what they proposed."""
        src = self.research._source_or_raise()
        pr = src.pull(self.number)
        head = pr["head"]["sha"]
        base = src.merge_base(pr["base"]["sha"], head)
        before = self.research.spec_at(base)
        after = self.research.spec_at(head)
        return diff_specs(before.sections if before else None, after.sections if after else [])

    # summaries ------------------------------------------------------------------------------------
    def describe(self) -> str:
        """A lab-note card: fields, metrics vs parent, conclusion, where it sits in the tree."""
        lines = [f"## {self.name}  (#{self.number}, {self.status}{', draft' if self.draft else ''})"]
        parent = self.parent
        lines.append(
            f"island {self.version.name} · parent {_label(parent)} · {self.started:%Y-%m-%d} -> {self.ended:%Y-%m-%d} · by {self.author}"
        )
        if self.hypothesis:
            lines.append(f"hypothesis: {self.hypothesis}")
        if self.change:
            lines.append(f"change: {self.change}")
        for k, v in self.metrics.items():
            d = self.delta(k)
            lines.append(f"  {k} = {_fmt(v)}" + (f"  (Δ {d:+.4g} vs parent)" if d is not None else ""))
        if self.conclusion:
            lines.append("conclusion: " + " ".join(self.conclusion.split())[:400])
        if self.children:
            lines.append("children: " + ", ".join(_label(c) for c in self.children))
        if self.produces:
            lines.append(f"produced: {self.produces.name}")
        if self.wandb:
            lines.append(f"wandb: {self.wandb}")
        if self.warnings:
            lines.append("warnings: " + ", ".join(self.warnings))
        lines.append(f"url: {self.url}")
        return "\n".join(lines)

    def __repr__(self) -> str:
        return f"Experiment({self.name}, {self.status})"


def _label(n: Node | None) -> str:
    if n is None:
        return "-"
    if isinstance(n, Version):
        return f"{n.research.root_branch} {n.name}"
    return n.name if isinstance(n, Experiment) else n.id


def _top_keys(exps: Sequence[Experiment], n: int) -> list[str]:
    """Most recorded metrics that have a known better direction (so "best" means something)."""
    counts: dict[str, int] = {}
    for e in exps:
        for k, v in e.metrics.items():
            if _number(v) is not None and metric_direction(k):
                counts[k] = counts.get(k, 0) + 1
    return [k for k, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]]


class Research:
    """The whole research tree of one repo. Start here: `print(research.manifest())`."""

    def __init__(self, tree: TreeData, source: Source | None = None) -> None:
        self._tree = tree
        self._source = source
        self.repo = tree.repo
        self.root_branch = tree.root
        self.prefix = tree.prefix
        self._versions: dict[str, Version] = {tree.root: Version(self, tree.root, tree.root_version, "", None)}
        for v in tree.versions.values():
            self._versions[v.id] = Version(self, v.id, v.name, v.sha, v.date)
        self._experiments = {i: Experiment(self, i) for i in tree.nodes}
        # `.researchtree` on the root branch (set by load(); empty when offline or absent)
        self.config: dict[str, str] = {}
        self.config_warnings: list[dict[str, str]] = []

    # access ---------------------------------------------------------------------------------------
    @property
    def root(self) -> Version:
        """The root branch as the first version (its island holds the first experiments)."""
        return self._versions[self.root_branch]

    @property
    def versions(self) -> list[Version]:
        """Every version, oldest first; the root is the first."""
        return list(self._versions.values())

    @property
    def latest(self) -> Version:
        return self.versions[-1]

    @property
    def experiments(self) -> Experiments:
        return Experiments(sorted(self._experiments.values(), key=lambda e: e.started))

    def version(self, name: str) -> Version:
        """By name (`v3`), id (`research@v3`), or the root branch name."""
        if name in self._versions:
            return self._versions[name]
        vid = f"{self.root_branch}@{name}"
        if vid in self._versions:
            return self._versions[vid]
        if self.root.name == name:
            return self.root
        raise KeyError(f"no version {name!r}; have {[v.name for v in self.versions]}")

    def experiment(self, name: str) -> Experiment:
        """By short name (`duet-mix`), branch (`experiment/duet-mix`) or PR number."""
        if isinstance(name, int) or (isinstance(name, str) and name.isdigit()):
            for e in self._experiments.values():
                if e.number == int(name):
                    return e
        elif name in self._experiments:
            return self._experiments[name]
        elif f"{self.prefix}{name}" in self._experiments:
            return self._experiments[f"{self.prefix}{name}"]
        raise KeyError(f"no experiment {name!r}")

    def __getitem__(self, name: str | int) -> Experiment | Version:
        try:
            return self.experiment(name)  # type: ignore[arg-type]
        except KeyError:
            return self.version(str(name))

    def __iter__(self) -> Iterator[Experiment]:
        return iter(self.experiments)

    def __len__(self) -> int:
        return len(self._experiments)

    def search(self, text: str) -> Experiments:
        return self.experiments.search(text)

    @property
    def running(self) -> Experiments:
        return self.experiments.where(status="running")

    @property
    def metric_keys(self) -> list[str]:
        keys: list[str] = []
        for e in self.experiments:
            keys.extend(k for k in e.metrics if k not in keys)
        return keys

    # intent and spec --------------------------------------------------------------------------------
    @property
    def spec_path(self) -> str:
        return self.config.get("spec", DEFAULT_SPEC_PATH)

    @property
    def intent_path(self) -> str:
        return self.config.get("intent", DEFAULT_INTENT_PATH)

    def spec_at(self, ref: str) -> Spec | None:
        """The spec document at any git ref (branch, tag or commit), includes expanded."""
        src = self._source_or_raise()
        spec = load_spec(self.spec_path, lambda p: src.file_text(p, ref))
        if spec is not None:
            spec.ref = ref
        return spec

    def spec(self, version: str | Version | None = None) -> Spec | None:
        """The spec of a version (default: the latest), i.e. the design as of that version."""
        v = version if isinstance(version, Version) else self.version(version) if version else self.latest
        return v.spec()

    def intent(self, version: str | Version | None = None) -> Spec | None:
        """The intent document (goals, claims, non-goals) at a version (default: the latest)."""
        v = version if isinstance(version, Version) else self.version(version) if version else self.latest
        src = self._source_or_raise()
        doc = load_spec(self.intent_path, lambda p: src.file_text(p, v.ref))
        if doc is not None:
            doc.ref = v.ref
        return doc

    def spec_history(self, key: str) -> list[tuple[Version, str]]:
        """Versions (oldest first) where a spec section was added, changed, renamed or removed."""
        specs = [(v, v.spec()) for v in self.versions]
        by_name = {v.name: v for v, _ in specs}
        hist = section_history([(v.name, s.sections if s else None) for v, s in specs], key)
        return [(by_name[h["version"]], h["kind"]) for h in hist]

    def claims(self) -> dict[str, Experiments]:
        """Experiments per intent claim id, from each PR's YAML `claims:`."""
        out: dict[str, Experiments] = {}
        for e in self.experiments:
            for c in e.claims:
                out.setdefault(c, Experiments()).append(e)
        return out

    # rules ----------------------------------------------------------------------------------------
    def check(self, rules: Iterable[Callable[[Research], Iterable[Any]]] | None = None) -> list[Any]:
        """Run the built-in rules (or the given ones) and return alerts, most severe first."""
        from .rules import run

        return run(self, rules)

    # summaries ------------------------------------------------------------------------------------
    def manifest(self, *, alerts: bool = True) -> str:
        """Compact overview meant to sit in an agent's context; drill down from here."""
        from .manifest import manifest

        return manifest(self, alerts=alerts)

    def to_dict(self) -> dict[str, Any]:
        """Plain data (JSON-ready) snapshot of the tree."""
        return {
            "repo": self.repo,
            "root": self.root_branch,
            "prefix": self.prefix,
            "versions": [
                {
                    "name": v.name,
                    "id": v.id,
                    "sha": v.sha,
                    "date": v.date.isoformat() if v.date else None,
                    "parent": v.parent.id if v.parent else None,
                    "merged": v.merged.names,
                }
                for v in self.versions
            ],
            "experiments": [
                {
                    "name": e.name,
                    "branch": e.branch,
                    "number": e.number,
                    "title": e.title,
                    "status": e.status,
                    "draft": e.draft,
                    "version": e.version.name,
                    "parent": e.parent.id if e.parent else None,
                    "children": [c.id for c in e.children],
                    "hypothesis": e.hypothesis,
                    "change": e.change,
                    "metrics": e.metrics,
                    "tags": e.tags,
                    "claims": e.claims,
                    "wandb": e.wandb,
                    "started": e.started.isoformat(),
                    "ended": e.ended.isoformat(),
                    "produces": e.produces.name if e.produces else None,
                    "conclusion": e.conclusion,
                    "warnings": e.warnings,
                    "url": e.url,
                }
                for e in self.experiments
            ],
        }

    # internals ------------------------------------------------------------------------------------
    def _node(self, id: str) -> Node:
        if id in self._experiments:
            return self._experiments[id]
        return self._versions[id]

    def _experiment(self, id: str) -> Experiment:
        return self._experiments[id]

    def _version(self, id: str) -> Version:
        return self._versions[id]

    def _source_or_raise(self) -> Source:
        if self._source is None:
            raise RuntimeError("this Research was built offline; commits/comments/files need researchtree.load()")
        return self._source

    def __repr__(self) -> str:
        return f"Research({self.repo}: {len(self)} experiments, {len(self.versions)} versions)"
