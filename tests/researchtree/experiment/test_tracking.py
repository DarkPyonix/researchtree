from __future__ import annotations

import warnings

import pytest

from base64 import b64encode

from researchtree import git
from researchtree.experiment import tracking as log
from researchtree.github import api, tokens
from researchtree.i18n import set_locale


@pytest.fixture
def fake_repo(monkeypatch):
    state = {"body": "```yaml\nhypothesis: h\n```\n", "patches": [], "calls": [], "config": None}
    monkeypatch.setattr(git, "current_branch", lambda cwd=None: "experiment/a")
    monkeypatch.setattr(git, "origin_repo", lambda cwd=None: "o/r")
    monkeypatch.setattr(tokens, "load_token", lambda: "tok")
    log._prefix_cache.clear()  # the prefix is read once per repository per process

    def call(method, path, *, token, query=None, body=None, **kw):
        state["calls"].append((method, path, query))
        if path == "/repos/o/r":
            return {"default_branch": "main"}
        if path.startswith("/repos/o/r/contents/"):
            if state["config"] is None:
                raise api.GitHubError(404, "not found")
            return {"type": "file", "encoding": "base64", "content": b64encode(state["config"].encode()).decode()}
        if path == "/repos/o/r/pulls":
            return [{"number": 7, "state": "open"}]
        if method == "GET":
            return {"number": 7, "body": state["body"]}
        state["patches"].append(body["body"])
        state["body"] = body["body"]
        return {}

    monkeypatch.setattr(api, "call", call)
    return state


def test_log_merges_metrics(fake_repo):
    log.log(val_loss=2.5)
    assert fake_repo["patches"] == ["```yaml\nhypothesis: h\nmetrics:\n  val_loss: 2.5\n```\n"]
    assert ("GET", "/repos/o/r/pulls", {"head": "o:experiment/a", "state": "all", "per_page": 10}) in fake_repo["calls"]


def test_set_field(fake_repo):
    log.set(wandb="https://wandb.ai/x")
    assert fake_repo["body"] == "```yaml\nhypothesis: h\nwandb: https://wandb.ai/x\n```\n"


def test_conclude(fake_repo):
    log.conclude("rejected", "느림")
    assert fake_repo["body"] == "```yaml\nhypothesis: h\nstatus: rejected\n```\n\n## 결론\n느림\n"


def test_conclude_heading_follows_the_language(fake_repo):
    set_locale("en")
    log.conclude("rejected", "slow")
    assert fake_repo["body"] == "```yaml\nhypothesis: h\nstatus: rejected\n```\n\n## Conclusion\nslow\n"


@pytest.mark.parametrize("env", [{"RANK": "1"}, {"LOCAL_RANK": "3"}])
def test_non_zero_rank_is_noop(fake_repo, monkeypatch, env):
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    log.log(a=1)
    assert fake_repo["calls"] == []


def test_rank_zero_runs(fake_repo, monkeypatch):
    monkeypatch.setenv("RANK", "0")
    monkeypatch.setenv("LOCAL_RANK", "0")
    log.log(a=1)
    assert fake_repo["patches"]


def test_non_experiment_branch_warns(fake_repo, monkeypatch):
    monkeypatch.setattr(git, "current_branch", lambda cwd=None: "main")
    with pytest.warns(RuntimeWarning, match="experiment/"):
        log.log(a=1)
    # Reading the repository's prefix is allowed; touching the PR is not.
    assert fake_repo["patches"] == []
    assert not [c for c in fake_repo["calls"] if "/pulls" in c[1]]


def test_missing_pr_warns(fake_repo, monkeypatch):
    monkeypatch.setattr(api, "call", lambda *a, **kw: [])
    with pytest.warns(RuntimeWarning, match="PR"):
        log.log(a=1)


def test_failures_never_raise(monkeypatch, fake_repo):
    attempts = []

    def boom(*a, **kw):
        attempts.append(a)
        if a[1] == "/repos/o/r/pulls":
            return [{"number": 7, "state": "open"}]
        raise api.GitHubError(500, "boom")

    monkeypatch.setattr(api, "call", boom)
    with pytest.warns(RuntimeWarning, match="boom"):
        log.log(a=1)
    pr_calls = [a for a in attempts if "/pulls" in a[1]]
    assert len(pr_calls) == 3  # PR lookup + two GET attempts (one retry)


def test_retry_succeeds(monkeypatch, fake_repo):
    real = api.call
    fails = {"n": 1}

    def flaky(method, path, **kw):
        if method == "PATCH" and fails["n"]:
            fails["n"] -= 1
            raise api.GitHubError(502, "flaky")
        return real(method, path, **kw)

    monkeypatch.setattr(api, "call", flaky)
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        log.log(a=1)
    assert fake_repo["patches"]


def test_broken_yaml_is_not_overwritten(fake_repo):
    fake_repo["body"] = "```yaml\nhypothesis: [x\n```\n"
    with pytest.warns(RuntimeWarning):
        log.log(a=1)
    assert fake_repo["patches"] == []


def test_invalid_status_warns(fake_repo):
    with pytest.warns(RuntimeWarning):
        log.conclude("done", "x")
    assert fake_repo["calls"] == []


def test_the_prefix_comes_from_the_repositorys_own_file(monkeypatch, fake_repo):
    # docs/CONVENTIONS.md: the branch names live in .researchtree.yml on the default branch.
    fake_repo["config"] = "prefix: exp\n"
    monkeypatch.setattr(git, "current_branch", lambda cwd=None: "exp/a")
    log.log(a=1)
    assert fake_repo["patches"]
    assert ("GET", "/repos/o/r", None) in fake_repo["calls"]


def test_a_branch_outside_the_prefix_is_left_alone(monkeypatch, fake_repo):
    monkeypatch.setattr(git, "current_branch", lambda cwd=None: "exp/a")
    with pytest.warns(RuntimeWarning):
        log.log(a=1)
    assert fake_repo["patches"] == []
