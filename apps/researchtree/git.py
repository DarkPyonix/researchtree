"""Local git info (current branch, origin remote)."""

from __future__ import annotations

import re
import subprocess

# https://github.com/o/r(.git), git@github.com:o/r(.git), ssh://git@github.com/o/r(.git)
_REMOTE_RE = re.compile(r"github\.com[:/]+([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$")


def _git(*args: str, cwd: str | None = None) -> str | None:
    try:
        out = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, timeout=10, check=True
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout.strip() or None


def current_branch(cwd: str | None = None) -> str | None:
    branch = _git("rev-parse", "--abbrev-ref", "HEAD", cwd=cwd)
    return None if branch in (None, "HEAD") else branch


def toplevel(cwd: str | None = None) -> str | None:
    """Root directory of the working tree, or None outside a git repository."""
    return _git("rev-parse", "--show-toplevel", cwd=cwd)


def parse_remote(url: str) -> str | None:
    m = _REMOTE_RE.search(url.strip())
    return f"{m.group(1)}/{m.group(2)}" if m else None


def origin_repo(cwd: str | None = None) -> str | None:
    url = _git("remote", "get-url", "origin", cwd=cwd)
    return parse_remote(url) if url else None
