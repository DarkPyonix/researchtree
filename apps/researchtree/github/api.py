"""Small urllib-based GitHub REST client shared by the server relay and rt.log."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from .. import __version__

API = "https://api.github.com"
USER_AGENT = f"researchtree/{__version__}"
ALLOWED_METHODS = ("GET", "POST", "PATCH", "PUT")

_SCHEME_RE = re.compile(r"^/*[a-z]+:", re.I)


class GitHubError(Exception):
    def __init__(self, status: int, message: str, data: Any = None):
        super().__init__(message)
        self.status = status
        self.data = data


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    body: bytes

    def json(self) -> Any:
        if not self.body:
            return None
        try:
            return json.loads(self.body)
        except ValueError:
            return self.body.decode("utf-8", "replace")


def assert_api_path(path: str) -> None:
    """Same check as TS `assertApiPath`: keeps the token from leaking to other domains."""
    if not path.startswith("/") or path.startswith("//") or _SCHEME_RE.match(path) or "\\" in path:
        raise ValueError(f"허용되지 않는 GitHub API 경로: {path}")


def build_query(query: dict[str, Any] | None) -> str:
    if not query:
        return ""
    s = urllib.parse.urlencode({k: str(v) for k, v in query.items() if v is not None})
    return f"?{s}" if s else ""


def raw_request(
    method: str,
    url: str,
    *,
    token: str | None = None,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 30,
) -> Response:
    """HTTP errors are returned as a Response rather than raised."""
    h = {"User-Agent": USER_AGENT, **(headers or {})}
    if token:
        h["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return Response(res.status, {k.lower(): v for k, v in res.headers.items()}, res.read())
    except urllib.error.HTTPError as e:
        return Response(e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read() or b"")


def request(
    method: str,
    path: str,
    *,
    token: str | None,
    query: dict[str, Any] | None = None,
    body: Any = None,
    etag: str | None = None,
) -> Response:
    """Request a path on `api.github.com`. Full URLs are not accepted."""
    if method not in ALLOWED_METHODS:
        raise ValueError(f"허용되지 않는 메서드: {method}")
    assert_api_path(path)
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if etag:
        headers["If-None-Match"] = etag
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    return raw_request(method, API + path + build_query(query), token=token, body=data, headers=headers)


def call(method: str, path: str, *, token: str | None, **kw: Any) -> Any:
    """Return JSON on success, raise GitHubError otherwise."""
    res = request(method, path, token=token, **kw)
    data = res.json()
    if res.status >= 400:
        msg = data.get("message") if isinstance(data, dict) else None
        raise GitHubError(res.status, f"GitHub API {res.status}: {msg or path}", data)
    return data
