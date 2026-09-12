"""Read a repo's research record from GitHub (the only data store)."""

from __future__ import annotations

import base64
import urllib.parse
from typing import Any

from ..github import api
from .build import parse_time, parse_version_tag
from .model import Comment, Commit, FileChange

_ACTIVITY_QUERY = """query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        first: commits(first: 1) { nodes { commit { authoredDate } } }
        last: commits(last: 1) { nodes { commit { committedDate } } }
      }
    }
  }
}"""


class Source:
    """GitHub reads for one repo. Lazy per-PR reads are cached for the life of the object."""

    def __init__(self, repo: str, token: str | None) -> None:
        self.repo = repo
        self.token = token
        self._cache: dict[tuple[str, Any], Any] = {}

    def _get(self, path: str, **query: Any) -> Any:
        return api.call("GET", path, token=self.token, query=query or None)

    def _paginate(self, path: str, limit: int = 30, **query: Any) -> list[Any]:
        out: list[Any] = []
        for page in range(1, limit + 1):
            items = self._get(path, **query, per_page=100, page=page)
            out.extend(items)
            if len(items) < 100:
                break
        return out

    def pulls(self) -> list[dict[str, Any]]:
        return self._paginate(f"/repos/{self.repo}/pulls", state="all")

    def version_tags(self, root: str) -> list[dict[str, Any]]:
        """Tags `<root>/vN` with each tagged commit's date."""
        tags = [t for t in self._paginate(f"/repos/{self.repo}/tags") if parse_version_tag(root, t["name"])]
        out = []
        for t in tags:
            c = self._get(f"/repos/{self.repo}/commits/{t['commit']['sha']}")["commit"]
            when = (c.get("committer") or {}).get("date") or (c.get("author") or {}).get("date") or ""
            out.append({"name": t["name"], "sha": t["commit"]["sha"], "date": when})
        return out

    def activity(self) -> dict[int, dict[str, Any]]:
        """First (authored) and last (committed) commit date per PR, via GraphQL."""
        owner, name = self.repo.split("/")
        out: dict[int, dict[str, Any]] = {}
        cursor = None
        for _ in range(20):
            res = api.call(
                "POST", "/graphql", token=self.token, body={"query": _ACTIVITY_QUERY, "variables": {"owner": owner, "name": name, "cursor": cursor}}
            )
            if res.get("errors"):
                raise api.GitHubError(200, f"GitHub GraphQL: {res['errors'][0].get('message')}", res)
            prs = ((res.get("data") or {}).get("repository") or {}).get("pullRequests")
            if not prs:
                break
            for n in prs["nodes"]:
                first = n["first"]["nodes"]
                last = n["last"]["nodes"]
                out[int(n["number"])] = {
                    "first": first[0]["commit"]["authoredDate"] if first else None,
                    "last": last[0]["commit"]["committedDate"] if last else None,
                }
            if not prs["pageInfo"]["hasNextPage"]:
                break
            cursor = prs["pageInfo"]["endCursor"]
        return out

    # lazy, per experiment ------------------------------------------------------------------------
    def commits(self, number: int) -> list[Commit]:
        key = ("commits", number)
        if key not in self._cache:
            raw = self._paginate(f"/repos/{self.repo}/pulls/{number}/commits", limit=3)
            self._cache[key] = [
                Commit(
                    sha=c["sha"],
                    message=c["commit"].get("message", ""),
                    author=((c.get("author") or {}).get("login") or (c["commit"].get("author") or {}).get("name") or "unknown"),
                    date=parse_time((c["commit"].get("author") or {}).get("date")),
                )
                for c in raw
            ]
        return self._cache[key]

    def comments(self, number: int) -> list[Comment]:
        key = ("comments", number)
        if key not in self._cache:
            raw = self._paginate(f"/repos/{self.repo}/issues/{number}/comments", limit=5)
            self._cache[key] = [
                Comment(author=(c.get("user") or {}).get("login", "unknown"), body=c.get("body") or "", date=parse_time(c.get("created_at")))
                for c in raw
            ]
        return self._cache[key]

    def files(self, number: int) -> list[FileChange]:
        key = ("files", number)
        if key not in self._cache:
            raw = self._paginate(f"/repos/{self.repo}/pulls/{number}/files", limit=30)
            self._cache[key] = [
                FileChange(path=f["filename"], status=f.get("status", ""), additions=int(f.get("additions", 0)), deletions=int(f.get("deletions", 0)))
                for f in raw
            ]
        return self._cache[key]

    # files at a git ref (intent / spec documents) --------------------------------------------------
    def default_branch(self) -> str | None:
        """The repository's own default branch, where `.researchtree.yml` lives."""
        key = ("repo", ())
        if key not in self._cache:
            try:
                self._cache[key] = self._get(f"/repos/{self.repo}")
            except api.GitHubError:
                self._cache[key] = {}
        data = self._cache[key]
        return data.get("default_branch") if isinstance(data, dict) else None

    def file_text(self, path: str, ref: str) -> str | None:
        """A file's text at a branch, tag or commit; None when it does not exist there."""
        key = ("file", (ref, path))
        if key not in self._cache:
            try:
                data = self._get(f"/repos/{self.repo}/contents/{urllib.parse.quote(path)}", ref=ref)
            except api.GitHubError as e:
                if e.status != 404:
                    raise
                data = None
            text = None
            if isinstance(data, dict) and data.get("type") == "file" and data.get("encoding") == "base64":
                text = base64.b64decode(data.get("content") or "").decode("utf-8", errors="replace")
            self._cache[key] = text
        return self._cache[key]

    def pull(self, number: int) -> dict[str, Any]:
        key = ("pull", number)
        if key not in self._cache:
            self._cache[key] = self._get(f"/repos/{self.repo}/pulls/{number}")
        return self._cache[key]

    def merge_base(self, base: str, head: str) -> str:
        """The commit where `head` forked from `base`."""
        key = ("merge-base", (base, head))
        if key not in self._cache:
            self._cache[key] = self._get(f"/repos/{self.repo}/compare/{base}...{head}", per_page=1)["merge_base_commit"]["sha"]
        return self._cache[key]
