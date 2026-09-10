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
from typing import Callable, Iterable

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
    return f"v{max(int(re.match(r'^v(\d+)', n).group(1)) for n in names) + 1}"  # type: ignore[union-attr]


def plan(research: Research, *, exists: Callable[[str], bool], merged: Callable[[str], bool]) -> list[Step]:
    """What to do with each finished experiment branch that still exists on the remote."""
    steps: list[Step] = []
    for e in research.experiments:
        if not e.finished or not exists(e.branch):
            continue
        running = [d.name for d in _island_descendants(e) if not d.finished]
        if running:
            steps.append(Step(KEEP, e.branch, "진행 중인 자손: " + ", ".join(running)))
        elif merged(e.branch):
            steps.append(Step(DELETE, e.branch, f"이미 {research.root_branch}에 포함됨"))
        else:
            steps.append(Step(ARCHIVE, e.branch, f"커밋을 revert한 뒤 {research.root_branch}에 머지해 기록 보존"))
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
            raise ReleaseError(f"git {' '.join(args)} 실패: {(res.stderr or res.stdout).strip()}")
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
        raise ReleaseError(f"{branch}: revert 후에도 내용이 갈라진 지점과 다릅니다.")
    git.run("switch", root)
    git.run("merge", "--no-ff", branch, "-m", f"Chore: Archive {branch}")
    if not git.ok("diff", "--quiet", "HEAD^1", "HEAD"):
        raise ReleaseError(f"{branch}: 보관 머지가 {root}의 내용을 바꿨습니다.")


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
        raise ReleaseError("작업 트리가 깨끗하지 않습니다. 커밋하거나 stash한 뒤 다시 실행하세요.")
    if git.ok("rev-parse", "--verify", "--quiet", f"refs/tags/{tag}"):
        raise ReleaseError(f"태그 {tag}가 이미 있습니다.")

    git.run("switch", root)
    git.run("merge", "--ff-only", f"{remote}/{root}")
    archived = [s.branch for s in steps if s.action == ARCHIVE]
    for branch in archived:
        log(f"보관 머지: {branch}")
        _archive(git, remote, root, branch)

    git.run("tag", "-a", tag, "-m", f"{root} {version}")
    log(f"태그: {tag}")
    git.run("push", remote, root, *archived, f"refs/tags/{tag}")

    gone = [s.branch for s in steps if s.action in (DELETE, ARCHIVE)]
    if gone:
        git.run("push", remote, "--delete", *gone)
        for branch in gone:
            if git.ok("rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"):
                git.run("branch", "-D", branch)
        log("삭제: " + ", ".join(gone))
    return tag


def describe(steps: Iterable[Step], version_tag_name: str) -> str:
    steps = list(steps)
    label = {DELETE: "삭제", ARCHIVE: "보관 머지 후 삭제", KEEP: "보류"}
    lines = [f"새 버전: {version_tag_name}"]
    if not steps:
        lines.append("정리할 브랜치가 없습니다.")
    for s in steps:
        lines.append(f"- [{label[s.action]}] {s.branch}: {s.reason}")
    return "\n".join(lines)
