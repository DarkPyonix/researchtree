"""Training-script API: update the current branch's PR body. Failures never stop training."""

from __future__ import annotations

import os
import warnings
from typing import Any, Callable

from .. import git
from ..github import api, tokens
from ..i18n import t
from . import body

DEFAULT_PREFIX = "experiment/"


_prefix_cache: dict[str, str] = {}


def experiment_prefix(repo: str | None = None, token: str | None = None) -> str:
    """The repository's experiment branch prefix, from its own `.researchtree` (docs/CONVENTIONS.md).

    One reading per process: a training run asks for this on every log call.
    """
    if not repo:
        return DEFAULT_PREFIX
    if repo not in _prefix_cache:
        from ..memory.source import Source
        from ..memory.spec import REPO_CONFIG_PATHS, parse_repo_config

        prefix = DEFAULT_PREFIX
        try:
            src = Source(repo, token)
            for ref, path in ((ref, path) for ref in (src.default_branch(), "research") if ref for path in REPO_CONFIG_PATHS):
                text = src.file_text(path, ref)
                if text is not None:
                    prefix = parse_repo_config(text)[0].get("prefix") or DEFAULT_PREFIX
                    break
        except Exception:  # no access, or no such file: the default is right often enough
            pass
        _prefix_cache[repo] = prefix if prefix.endswith("/") else prefix + "/"
    return _prefix_cache[repo]
STATUSES = body.STATUSES


class _Skip(Exception):
    pass


def _is_rank0() -> bool:
    for key in ("RANK", "LOCAL_RANK"):
        v = os.environ.get(key)
        if v not in (None, "", "0"):
            return False
    return True


def _find_pr(token: str, repo: str, branch: str) -> dict[str, Any]:
    owner = repo.split("/")[0]
    prs = api.call(
        "GET", f"/repos/{repo}/pulls", token=token, query={"head": f"{owner}:{branch}", "state": "all", "per_page": 10}
    )
    if not prs:
        raise _Skip(t("track.noPr", branch=branch))
    # prefer open PRs
    prs.sort(key=lambda p: (p.get("state") != "open", -int(p.get("number", 0))))
    return prs[0]


def _apply(edit: Callable[[str], str]) -> None:
    if not _is_rank0():
        return
    try:
        branch = git.current_branch()
        repo = os.environ.get("RESEARCHTREE_REPO") or git.origin_repo()
        if not repo:
            raise _Skip(t("track.noRepo"))
        token = tokens.load_token()
        if not token:
            raise _Skip(t("track.noToken"))
        prefix = experiment_prefix(repo, token)
        if not branch or not branch.startswith(prefix):
            raise _Skip(t("track.notExperiment", branch=branch or t("track.unknownBranch"), prefix=prefix))

        number = _find_pr(token, repo, branch)["number"]
        last: Exception | None = None
        for _ in range(2):  # one retry on failure
            try:
                # re-read right before writing so we don't clobber someone else's edit
                pr = api.call("GET", f"/repos/{repo}/pulls/{number}", token=token)
                api.call("PATCH", f"/repos/{repo}/pulls/{number}", token=token, body={"body": edit(pr.get("body") or "")})
                return
            except body.PrBodyError:
                raise
            except Exception as e:  # noqa: BLE001
                last = e
        raise last or RuntimeError(t("track.unknownError"))
    except _Skip as e:
        warnings.warn(f"researchtree: {e}", RuntimeWarning, stacklevel=3)
    except Exception as e:  # noqa: BLE001 - never raise into the training script
        warnings.warn("researchtree: " + t("track.updateFailed", error=e), RuntimeWarning, stacklevel=3)


def log(**metrics: float | int | str | None) -> None:
    """Merge values into `metrics`. A None value deletes that metric."""
    if metrics:
        _apply(lambda current: body.update(current, {"metrics": metrics}))


def set(**fields: Any) -> None:  # noqa: A001 - public rt.set API
    """Set arbitrary YAML fields. A None value deletes the field."""
    if fields:
        _apply(lambda current: body.update(current, fields))


def conclude(status: str, text: str, heading: str | None = None) -> None:
    """Set `status` and write the conclusion section. An existing `## 결론` / `## Conclusion` section is
    updated in place; a new one gets `heading`, by default `## 결론` or `## Conclusion` by the CLI language."""
    if status not in STATUSES:
        warnings.warn("researchtree: " + t("track.badStatus", allowed=", ".join(STATUSES), status=status), RuntimeWarning, stacklevel=2)
        return
    _apply(lambda current: body.set_conclusion(body.update(current, {"status": status}), text, heading or t("body.conclusionHeading")))
