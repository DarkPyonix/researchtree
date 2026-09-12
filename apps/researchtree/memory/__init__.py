"""Research memory: the PR tree as typed Python objects an agent can navigate and compute over.

    import researchtree as rt
    research = rt.load()                      # the repo of the current directory's `origin`
    print(research.manifest())                # compact overview, then drill down
    v3 = research.version("v3")               # an island
    e = research["duet-mix"]                  # an experiment: .hypothesis .metrics .parent .children .body
    research.experiments.where(status="adopted").best("val_loss")
    [a for a in research.check() if a.severity == "warn"]
"""

from __future__ import annotations

import os
from typing import Any, Iterable, Mapping

from .. import git
from ..github import tokens
from .build import DEFAULT_PREFIX, DEFAULT_ROOT, build_tree
from .model import Comment, Commit, Experiment, Experiments, FileChange, Research, Version, metric_direction
from .rules import Alert
from .source import Source
from .spec import REPO_CONFIG_PATH, Section, SectionChange, Spec, parse_repo_config


def _repo_config(src: Source) -> tuple[dict[str, str], list[dict[str, str]]]:
    """`.researchtree.yml` from the default branch, falling back to the root branch for older repos."""
    for ref in (src.default_branch(), DEFAULT_ROOT):
        if not ref:
            continue
        try:
            text = src.file_text(REPO_CONFIG_PATH, ref)
        except Exception:  # no access, or no such branch: try the next place
            continue
        if text is not None:
            return parse_repo_config(text)
    return {}, []


def load(
    repo: str | None = None,
    *,
    root: str | None = None,
    prefix: str | None = None,
    token: str | None = None,
    activity: bool = True,
) -> Research:
    """Read a repo's research tree from GitHub.

    `repo` defaults to RESEARCHTREE_REPO, then the current directory's `origin`. The branch names
    come from the repository's own `.researchtree.yml` (`root`, `prefix`) on its default branch, so
    everyone reading the repository sees the same tree; passing `root` or `prefix` here overrides it.
    The token comes from `researchtree login` or RESEARCHTREE_TOKEN; public repos work without one.
    """
    repo = repo or os.environ.get("RESEARCHTREE_REPO") or git.origin_repo()
    if not repo:
        raise ValueError("no repo given and no GitHub `origin` remote here; pass load('owner/name')")
    src = Source(repo, token if token is not None else tokens.load_token())
    config, warnings = _repo_config(src)
    root = root or config.get("root") or DEFAULT_ROOT
    prefix = prefix or config.get("prefix") or DEFAULT_PREFIX
    if not prefix.endswith("/"):
        prefix += "/"
    prs = src.pulls()
    try:
        tags = src.version_tags(root)
    except Exception:  # a repo without tags (or no access to them) still gets a tree
        tags = []
    acts: Mapping[int, Mapping[str, Any]] = {}
    if activity:
        try:
            acts = src.activity()
        except Exception:  # GraphQL needs a token; fall back to PR dates
            acts = {}
    research = Research(build_tree(prs, repo, root=root, prefix=prefix, tags=tags, activity=acts), src)
    research.config, research.config_warnings = config, warnings
    return research


def from_data(
    prs: Iterable[Mapping[str, Any]],
    repo: str,
    *,
    root: str = DEFAULT_ROOT,
    prefix: str = DEFAULT_PREFIX,
    tags: Iterable[Mapping[str, Any]] = (),
    activity: Mapping[int, Mapping[str, Any]] | None = None,
) -> Research:
    """Build offline from already-fetched GitHub data (tests, notebooks, snapshots)."""
    return Research(build_tree(prs, repo, root=root, prefix=prefix, tags=tags, activity=activity))


__all__ = [
    "load",
    "from_data",
    "Research",
    "Version",
    "Experiment",
    "Experiments",
    "Commit",
    "Comment",
    "FileChange",
    "Alert",
    "Spec",
    "Section",
    "SectionChange",
    "metric_direction",
]
