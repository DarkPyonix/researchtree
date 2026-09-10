from __future__ import annotations

import os
import stat
import sys

from researchtree.github import tokens


class FakeKeyring:
    def __init__(self) -> None:
        self.store: dict[tuple[str, str], str] = {}

    def get_password(self, s, u):
        return self.store.get((s, u))

    def set_password(self, s, u, p):
        self.store[(s, u)] = p

    def delete_password(self, s, u):
        self.store.pop((s, u), None)


def test_token_precedence(monkeypatch):
    assert tokens.load_token() is None

    where = tokens.store_token("file-token")
    assert tokens.load_token() == "file-token"
    if sys.platform != "win32":
        assert stat.S_IMODE(os.stat(where).st_mode) == 0o600

    kr = FakeKeyring()
    monkeypatch.setattr(tokens, "_keyring", lambda: kr)
    kr.set_password(tokens.KEYRING_SERVICE, tokens.KEYRING_USER, "keyring-token")
    assert tokens.load_token() == "keyring-token"

    monkeypatch.setenv(tokens.ENV_TOKEN, "env-token")
    assert tokens.load_token() == "env-token"

    monkeypatch.delenv(tokens.ENV_TOKEN)
    tokens.delete_token()
    assert tokens.load_token() is None


def test_store_prefers_keyring(monkeypatch):
    kr = FakeKeyring()
    monkeypatch.setattr(tokens, "_keyring", lambda: kr)
    assert tokens.store_token("t") == "keyring"
    assert not tokens.token_file().exists()
    assert tokens.load_token() == "t"
