"""Training-script API: update the current branch's PR body. Failures never stop training."""

from __future__ import annotations

import os
import warnings
from typing import Any, Callable

from .. import git
from ..github import api, tokens
from . import body

DEFAULT_PREFIX = "experiment/"


def experiment_prefix() -> str:
    """Experiment branch prefix; override with RESEARCHTREE_PREFIX to match the viewer's branch settings."""
    prefix = os.environ.get("RESEARCHTREE_PREFIX", "").strip() or DEFAULT_PREFIX
    return prefix if prefix.endswith("/") else prefix + "/"
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
        raise _Skip(f"브랜치 {branch}의 PR을 찾지 못했습니다.")
    # prefer open PRs
    prs.sort(key=lambda p: (p.get("state") != "open", -int(p.get("number", 0))))
    return prs[0]


def _apply(edit: Callable[[str], str]) -> None:
    if not _is_rank0():
        return
    try:
        branch = git.current_branch()
        prefix = experiment_prefix()
        if not branch or not branch.startswith(prefix):
            raise _Skip(f"현재 브랜치({branch or '알 수 없음'})가 {prefix}* 가 아니라서 기록하지 않습니다.")
        repo = os.environ.get("RESEARCHTREE_REPO") or git.origin_repo()
        if not repo:
            raise _Skip("origin remote에서 GitHub 레포를 알아내지 못했습니다.")
        token = tokens.load_token()
        if not token:
            raise _Skip("GitHub 토큰이 없습니다. `researchtree login`을 먼저 실행하세요.")

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
        raise last or RuntimeError("알 수 없는 오류")
    except _Skip as e:
        warnings.warn(f"researchtree: {e}", RuntimeWarning, stacklevel=3)
    except Exception as e:  # noqa: BLE001 - never raise into the training script
        warnings.warn(f"researchtree: PR 본문을 갱신하지 못했습니다: {e}", RuntimeWarning, stacklevel=3)


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
    updated in place; a new one gets `heading` (default `결론`, e.g. heading="Conclusion")."""
    if status not in STATUSES:
        warnings.warn(f"researchtree: status는 {', '.join(STATUSES)} 중 하나여야 합니다: {status}", RuntimeWarning, stacklevel=2)
        return
    _apply(lambda current: body.set_conclusion(body.update(current, {"status": status}), text, heading))
