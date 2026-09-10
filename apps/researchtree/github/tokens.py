"""GitHub token storage. Lookup order: env var -> OS keyring -> config file."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

KEYRING_SERVICE = "researchtree"
KEYRING_USER = "github"
ENV_TOKEN = "RESEARCHTREE_TOKEN"


def config_dir() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    return base / "researchtree"


def token_file() -> Path:
    return config_dir() / "token"


def _keyring() -> Any | None:
    try:
        import keyring  # type: ignore[import-not-found]
    except Exception:
        return None
    return keyring


def load_token() -> str | None:
    env = os.environ.get(ENV_TOKEN, "").strip()
    if env:
        return env
    kr = _keyring()
    if kr is not None:
        try:
            t = kr.get_password(KEYRING_SERVICE, KEYRING_USER)
            if t:
                return t
        except Exception:
            pass
    try:
        t = token_file().read_text(encoding="utf-8").strip()
        return t or None
    except OSError:
        return None


def store_token(token: str) -> str:
    """Return where the token was stored ("keyring" or a file path)."""
    kr = _keyring()
    if kr is not None:
        try:
            kr.set_password(KEYRING_SERVICE, KEYRING_USER, token)
            return "keyring"
        except Exception:
            pass
    path = token_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(token)
    if sys.platform != "win32":
        os.chmod(path, 0o600)
    return str(path)


def delete_token() -> None:
    kr = _keyring()
    if kr is not None:
        try:
            kr.delete_password(KEYRING_SERVICE, KEYRING_USER)
        except Exception:
            pass
    try:
        token_file().unlink()
    except OSError:
        pass
