"""Reading and writing the account's `.researchisland` settings repository over the GitHub API.

Keeping this apart from island.py means the map rules can be tested without a network, and the CLI
can say plainly what it is about to change before it changes it.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass

from .github import api
from .island import CONFIG_PATH, CONFIG_REPO, IslandMap, new_readme, parse_map, write_map


@dataclass
class Settings:
    """The settings repository as it stands right now."""

    repo: str
    exists: bool
    text: str
    sha: str | None
    island_map: IslandMap


def settings_repo(user: str) -> str:
    return f"{user}/{CONFIG_REPO}"


def current_user(token: str) -> str:
    return str(api.call("GET", "/user", token=token)["login"])


def load(user: str, token: str | None) -> Settings:
    """The map as the viewer would read it. A missing repository or README is not an error."""
    repo = settings_repo(user)
    try:
        data = api.call("GET", f"/repos/{repo}/contents/{CONFIG_PATH}", token=token)
    except api.GitHubError as e:
        if e.status == 404:
            return Settings(repo=repo, exists=False, text="", sha=None, island_map=IslandMap())
        raise
    if not isinstance(data, dict):
        return Settings(repo=repo, exists=False, text="", sha=None, island_map=IslandMap())
    text = base64.b64decode(str(data.get("content", "")).encode()).decode("utf-8", "replace")
    return Settings(repo=repo, exists=True, text=text, sha=str(data.get("sha")) or None, island_map=parse_map(text))


def save(settings: Settings, island_map: IslandMap, token: str, *, user: str, message: str) -> None:
    """Write the map back, keeping every word of prose around it."""
    text = write_map(settings.text, island_map) if settings.exists else new_readme(user, island_map)
    body = {
        "message": message,
        "content": base64.b64encode(text.encode()).decode(),
    }
    if settings.sha:
        body["sha"] = settings.sha
    api.call("PUT", f"/repos/{settings.repo}/contents/{CONFIG_PATH}", token=token, body=body)


def create_settings_repo(token: str, *, owner: str | None = None, private: bool = False) -> None:
    """Make the `.researchisland` repository. The map itself is written by save().

    An organization owns its repositories, so the path differs from a personal account's.
    """
    path = "/user/repos" if owner is None or owner == current_user(token) else f"/orgs/{owner}/repos"
    api.call(
        "POST",
        path,
        token=token,
        body={
            "name": CONFIG_REPO,
            "description": "ResearchIsland map: which research this account shows, and where each one sits.",
            "private": private,
            "auto_init": False,
        },
    )
