"""Cut a new research version and clean up finished experiment branches (docs/CONVENTIONS.md 1.4).

Finished branches (PR merged or closed) are deleted when a version is cut. A branch already in the
root branch is deleted as is. Any other branch is archived first so its history stays reachable:
its commits are reverted on the branch (new commits, never a reset), the branch is merged into the
root branch with --no-ff (a no-op for the code), then deleted. Branches with running descendants
are kept for a later version: reverting a parent before its child lands would drop code the child
builds on.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from ..i18n import t
from ..memory.build import version_tag
from ..memory.model import Experiment, Research

DELETE = "delete"  # already in the root branch
ARCHIVE = "archive"  # revert, merge into the root branch, delete
KEEP = "keep"  # has running descendants


class ReleaseError(Exception):
    pass


@dataclass(frozen=True)
class Step:
    action: str
    branch: str
    reason: str


def next_version(research: Research) -> str:
    """The major version after the latest: v3 -> v4, v2.1 -> v3; v1 when there are no versions."""
    names = [v.name for v in research.versions if re.match(r"^v\d+", v.name)]
    if not names:
        return "v1"
    major = max(int(re.match(r"^v(\d+)", n).group(1)) for n in names)  # type: ignore[union-attr]
    return f"v{major + 1}"


def plan(research: Research, *, exists: Callable[[str], bool], merged: Callable[[str], bool]) -> list[Step]:
    """What to do with each finished experiment branch that still exists on the remote."""
    steps: list[Step] = []
    for e in research.experiments:
        if not e.finished or not exists(e.branch):
            continue
        running = [d.name for d in _island_descendants(e) if not d.finished]
        if running:
            steps.append(Step(KEEP, e.branch, t("release.reason.running", names=", ".join(running))))
        elif merged(e.branch):
            steps.append(Step(DELETE, e.branch, t("release.reason.merged", root=research.root_branch)))
        else:
            steps.append(Step(ARCHIVE, e.branch, t("release.reason.archive", root=research.root_branch)))
    return steps


def _island_descendants(e: Experiment) -> list[Experiment]:
    """Experiments that build on this branch's code: its descendants on the same island. A later
    version's island starts from the root branch, not from this branch, so the walk stops there."""
    out: list[Experiment] = []
    stack = [c for c in e.children if isinstance(c, Experiment)]
    while stack:
        n = stack.pop()
        out.append(n)
        stack.extend(c for c in n.children if isinstance(c, Experiment))
    return out


class Git:
    """Strict git runner for one working tree: any failure raises ReleaseError."""

    def __init__(self, cwd: str | None = None) -> None:
        self.cwd = cwd

    def run(self, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        res = subprocess.run(["git", *args], cwd=self.cwd, capture_output=True, text=True, encoding="utf-8")
        if check and res.returncode != 0:
            raise ReleaseError(t("release.gitFailed", args=" ".join(args), error=(res.stderr or res.stdout).strip()))
        return res

    def out(self, *args: str) -> str:
        return self.run(*args).stdout.strip()

    def ok(self, *args: str) -> bool:
        return self.run(*args, check=False).returncode == 0


def remote_checks(git: Git, remote: str, root: str) -> tuple[Callable[[str], bool], Callable[[str], bool]]:
    """`exists(branch)` and `merged(branch)` against the fetched remote-tracking refs."""

    def exists(branch: str) -> bool:
        return git.ok("rev-parse", "--verify", "--quiet", f"refs/remotes/{remote}/{branch}")

    def merged(branch: str) -> bool:
        return git.ok("merge-base", "--is-ancestor", f"{remote}/{branch}", f"{remote}/{root}")

    return exists, merged


def _held_elsewhere(git: Git, branches: Iterable[str]) -> dict[str, str]:
    """Branches checked out in another worktree, mapped to that worktree's path. Git refuses to
    switch to or delete such a branch here."""
    here = Path(git.out("rev-parse", "--show-toplevel")).resolve()
    held: dict[str, str] = {}
    path: str | None = None
    for line in git.out("worktree", "list", "--porcelain").splitlines():
        if line.startswith("worktree "):
            path = line[len("worktree ") :]
        elif line.startswith("branch refs/heads/") and path and Path(path).resolve() != here:
            held[line[len("branch refs/heads/") :]] = path
    wanted = set(branches)
    return {b: p for b, p in held.items() if b in wanted}


def _archive(git: Git, remote: str, root: str, branch: str) -> None:
    git.run("switch", "-C", branch, f"{remote}/{branch}")
    base = git.out("merge-base", root, branch)
    commits = git.out("rev-list", f"{base}..{branch}")
    if commits:
        # One revert commit per experiment commit, newest first. Merge commits or conflicts make
        # that fail; then one commit restores the fork point's content instead (still a revert:
        # nothing is rewritten).
        if not git.ok("revert", "--no-edit", f"{base}..{branch}"):
            git.run("revert", "--abort", check=False)
            git.run("read-tree", "--reset", "-u", base)
            git.run("commit", "--allow-empty", "-m", f"Revert: Undo {branch} back to {base[:7]} for archiving")
    if not git.ok("diff", "--quiet", base, branch):
        raise ReleaseError(t("release.revertMismatch", branch=branch))
    git.run("switch", root)
    git.run("merge", "--no-ff", branch, "-m", f"Chore: Archive {branch}")
    if not git.ok("diff", "--quiet", "HEAD^1", "HEAD"):
        raise ReleaseError(t("release.archiveChanged", branch=branch, root=root))


def execute(
    research: Research,
    steps: Iterable[Step],
    version: str,
    *,
    git: Git,
    remote: str = "origin",
    log: Callable[[str], None] = print,
) -> str:
    """Archive, tag `<root>/<version>`, push, delete. Returns the tag. The working tree must be clean."""
    root = research.root_branch
    tag = version_tag(root, version)
    steps = list(steps)
    if git.out("status", "--porcelain"):
        raise ReleaseError(t("release.dirty"))
    if git.ok("rev-parse", "--verify", "--quiet", f"refs/tags/{tag}"):
        raise ReleaseError(t("release.tagExists", tag=tag))
    held = _held_elsewhere(git, [root, *(s.branch for s in steps if s.action in (DELETE, ARCHIVE))])
    if held:
        lines = "\n".join(f"  {b}: git worktree remove {p}" for b, p in sorted(held.items()))
        raise ReleaseError(t("release.worktrees") + "\n" + lines)

    git.run("switch", root)
    git.run("merge", "--ff-only", f"{remote}/{root}")
    archived = [s.branch for s in steps if s.action == ARCHIVE]
    for branch in archived:
        log(t("release.log.archive", branch=branch))
        _archive(git, remote, root, branch)

    git.run("tag", "-a", tag, "-m", f"{root} {version}")
    log(t("release.log.tag", tag=tag))
    git.run("push", remote, root, *archived, f"refs/tags/{tag}")

    gone = [s.branch for s in steps if s.action in (DELETE, ARCHIVE)]
    if gone:
        git.run("push", remote, "--delete", *gone)
        for branch in gone:
            if git.ok("rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"):
                git.run("branch", "-D", branch)
        log(t("release.log.deleted", names=", ".join(gone)))
    return tag


def describe(steps: Iterable[Step], version_tag_name: str) -> str:
    steps = list(steps)
    label = {DELETE: t("release.action.delete"), ARCHIVE: t("release.action.archive"), KEEP: t("release.action.keep")}
    lines = [t("release.newVersion", tag=version_tag_name)]
    if not steps:
        lines.append(t("release.nothing"))
    for s in steps:
        lines.append(f"- [{label[s.action]}] {s.branch}: {s.reason}")
    return "\n".join(lines)
