"""State for one `researchtree serve` run: session token, signed-in user, Device Flow."""

from __future__ import annotations

import secrets
import threading
from pathlib import Path
from typing import Any

from ..github import api, auth, tokens

STATIC_DIR = Path(__file__).parent / "static"


class App:
    """State for a single server run."""

    def __init__(self, repo: str | None, static_dir: Path = STATIC_DIR):
        self.repo = repo
        self.static_dir = static_dir
        self.session = secrets.token_urlsafe(32)
        self.port = 0
        self.flow = auth.DeviceFlow()
        self._lock = threading.Lock()
        self._user: tuple[str, dict[str, Any]] | None = None

    @property
    def allowed_hosts(self) -> set[str]:
        return {f"127.0.0.1:{self.port}", f"localhost:{self.port}"}

    def user(self) -> dict[str, Any] | None:
        token = tokens.load_token()
        if not token:
            return None
        with self._lock:
            if self._user and self._user[0] == token:
                return self._user[1]
        try:
            u = auth.fetch_user(token)
        except api.GitHubError as e:
            if e.status == 401:
                return None
            raise
        with self._lock:
            self._user = (token, u)
        return u

    def forget_user(self) -> None:
        with self._lock:
            self._user = None
