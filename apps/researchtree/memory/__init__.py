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


def load(
    repo: str | None = None,
    *,
    root: str | None = None,
    prefix: str | None = None,
    token: str | None = None,
    activity: bool = True,
) -> Research:
    """Read a repo's research tree from GitHub.

    `repo` defaults to RESEARCHTREE_REPO, then the current directory's `origin`. `root` defaults to
    RESEARCHTREE_ROOT, then `research`. `prefix` defaults to RESEARCHTREE_PREFIX, then the repo's
    `.researchtree.yml` on the root branch, then `experiment/`. The token comes from
    `researchtree login` or RESEARCHTREE_TOKEN; public repos also work without one.
    """
    repo = repo or os.environ.get("RESEARCHTREE_REPO") or git.origin_repo()
    if not repo:
        raise ValueError("no repo given and no GitHub `origin` remote here; pass load('owner/name')")
    root = root or os.environ.get("RESEARCHTREE_ROOT", "").strip() or DEFAULT_ROOT
    src = Source(repo, token if token is not None else tokens.load_token())
    config: dict[str, str] = {}
    warnings: list[dict[str, str]] = []
    try:
        text = src.file_text(REPO_CONFIG_PATH, root)
        if text is not None:
            config, warnings = parse_repo_config(text)
    except Exception:  # no access to the file (or no root branch yet): run on the defaults
        pass
    prefix = prefix or os.environ.get("RESEARCHTREE_PREFIX", "").strip() or config.get("prefix") or DEFAULT_PREFIX
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
