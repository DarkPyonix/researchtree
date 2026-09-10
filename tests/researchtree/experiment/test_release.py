"""Version release: plan and archive finished branches in a real throwaway git repo."""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

import researchtree as rt
from researchtree.experiment import release


def sh(cwd: Path, *args: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def commit(cwd: Path, name: str, text: str, msg: str) -> str:
    (cwd / name).write_text(text, encoding="utf-8")
    sh(cwd, "add", name)
    sh(cwd, "commit", "-m", msg)
    return sh(cwd, "rev-parse", "HEAD")


def pr(n: int, head: str, base: str, *, state: str, merged: bool = False, day: int = 1) -> dict:
    when = f"2026-03-{day:02d}T00:00:00Z"
    return {
        "number": n,
        "title": head,
        "state": state,
        "draft": False,
        "created_at": when,
        "updated_at": when,
        "closed_at": when if state == "closed" else None,
        "merged_at": when if merged else None,
        "head": {"ref": head, "sha": ""},
        "base": {"ref": base},
        "body": f"```yaml\nhypothesis: {head}\n```\n",
        "user": {"login": "t"},
    }


@pytest.fixture()
def repo(tmp_path: Path) -> dict:
    remote = tmp_path / "remote.git"
    work = tmp_path / "work"
    subprocess.run(["git", "init", "--bare", "-b", "research", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "clone", str(remote), str(work)], check=True, capture_output=True)
    for k, v in (("user.name", "t"), ("user.email", "t@example.com"), ("commit.gpgsign", "false"), ("tag.gpgsign", "false")):
        sh(work, "config", k, v)
    sh(work, "switch", "-c", "research")
    commit(work, "base.txt", "base\n", "init")
    sh(work, "tag", "-a", "research/v1", "-m", "v1")
    sh(work, "push", "origin", "research", "research/v1")

    # a: adopted and merged into research
    sh(work, "switch", "-c", "experiment/a", "research")
    commit(work, "a.txt", "a\n", "a")
    sh(work, "switch", "research")
    sh(work, "merge", "--no-ff", "experiment/a", "-m", "adopt a")
    # b: rejected, two commits, never merged
    sh(work, "switch", "-c", "experiment/b", "research/v1")
    b1 = commit(work, "b.txt", "b1\n", "b1")
    commit(work, "base.txt", "base changed by b\n", "b2")
    # c: rejected but its child d is still running
    sh(work, "switch", "-c", "experiment/c", "research/v1")
    c1 = commit(work, "c.txt", "c\n", "c")
    sh(work, "switch", "-c", "experiment/d")
    commit(work, "d.txt", "d\n", "d")
    sh(work, "switch", "research")
    sh(work, "push", "origin", "research", "experiment/a", "experiment/b", "experiment/c", "experiment/d")

    prs = [
        pr(1, "experiment/a", "research", state="closed", merged=True, day=2),
        pr(2, "experiment/b", "research", state="closed", day=3),
        pr(3, "experiment/c", "research", state="closed", day=4),
        pr(4, "experiment/d", "experiment/c", state="open", day=5),
    ]
    research = rt.from_data(prs, "o/r", tags=[{"name": "research/v1", "sha": "", "date": "2026-03-01T00:00:00Z"}])
    return {"work": work, "research": research, "b1": b1, "c1": c1}


def test_next_version(repo) -> None:
    assert release.next_version(repo["research"]) == "v2"


def test_plan(repo) -> None:
    g = release.Git(str(repo["work"]))
    g.run("fetch", "origin", "--prune")
    exists, merged = release.remote_checks(g, "origin", "research")
    steps = {s.branch: s.action for s in release.plan(repo["research"], exists=exists, merged=merged)}
    assert steps == {"experiment/a": release.DELETE, "experiment/b": release.ARCHIVE, "experiment/c": release.KEEP}


def test_execute_archives_and_deletes(repo) -> None:
    work: Path = repo["work"]
    g = release.Git(str(work))
    g.run("fetch", "origin", "--prune")
    exists, merged = release.remote_checks(g, "origin", "research")
    steps = release.plan(repo["research"], exists=exists, merged=merged)
    before = sh(work, "rev-parse", "origin/research^{tree}")

    tag = release.execute(repo["research"], steps, "v2", git=g, log=lambda _: None)

    assert tag == "research/v2"
    sh(work, "fetch", "origin", "--prune", "--tags")
    heads = sh(work, "ls-remote", "--heads", "origin")
    assert "experiment/a" not in heads and "experiment/b" not in heads
    assert "experiment/c" in heads and "experiment/d" in heads  # kept for later
    # b's history is reachable from research, but research's content did not change
    assert g.ok("merge-base", "--is-ancestor", repo["b1"], "origin/research")
    assert sh(work, "rev-parse", "origin/research^{tree}") == before
    assert "b.txt" not in sh(work, "ls-tree", "--name-only", "origin/research")
    # the tag sits on the archived research tip
    assert sh(work, "rev-parse", "research/v2^{commit}") == sh(work, "rev-parse", "origin/research")
    # the archived branch holds reverts, not rewritten history
    log = sh(work, "log", "--format=%s", "origin/research")
    assert "Chore: Archive experiment/b" in log and 'Revert "b2"' in log and 'Revert "b1"' in log


def test_execute_refuses_dirty_tree(repo) -> None:
    (repo["work"] / "dirty.txt").write_text("x", encoding="utf-8")
    g = release.Git(str(repo["work"]))
    with pytest.raises(release.ReleaseError):
        release.execute(repo["research"], [], "v2", git=g, log=lambda _: None)


def test_archive_branch_with_merge_commit(repo) -> None:
    """A parent that absorbed an adopted child has a merge commit: per-commit revert fails, so one
    restoring commit is used instead. History is still kept and research's content is unchanged."""
    work: Path = repo["work"]
    sh(work, "switch", "-c", "experiment/p", "research/v1")
    p1 = commit(work, "p.txt", "p\n", "p")
    sh(work, "switch", "-c", "experiment/q")
    commit(work, "q.txt", "q\n", "q")
    sh(work, "switch", "experiment/p")
    sh(work, "merge", "--no-ff", "experiment/q", "-m", "adopt q into p")
    sh(work, "switch", "research")
    sh(work, "push", "origin", "experiment/p", "experiment/q")
    prs = [
        pr(5, "experiment/p", "research", state="closed", day=6),
        pr(6, "experiment/q", "experiment/p", state="closed", merged=True, day=7),
    ]
    research = rt.from_data(prs, "o/r", tags=[{"name": "research/v1", "sha": "", "date": "2026-03-01T00:00:00Z"}])
    g = release.Git(str(work))
    g.run("fetch", "origin", "--prune")
    exists, merged = release.remote_checks(g, "origin", "research")
    steps = release.plan(research, exists=exists, merged=merged)
    assert {s.branch: s.action for s in steps} == {"experiment/p": release.ARCHIVE, "experiment/q": release.ARCHIVE}
    before = sh(work, "rev-parse", "origin/research^{tree}")

    release.execute(research, steps, "v2", git=g, log=lambda _: None)

    sh(work, "fetch", "origin", "--prune")
    assert g.ok("merge-base", "--is-ancestor", p1, "origin/research")
    assert sh(work, "rev-parse", "origin/research^{tree}") == before
    heads = sh(work, "ls-remote", "--heads", "origin")
    assert "experiment/p" not in heads and "experiment/q" not in heads
