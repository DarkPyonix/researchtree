from __future__ import annotations

import pytest

from researchtree.github import tokens
from researchtree.i18n import set_locale


@pytest.fixture(autouse=True)
def isolated_tokens(tmp_path, monkeypatch):
    """Never touch the real keyring, config dir, or env token during tests."""
    monkeypatch.delenv(tokens.ENV_TOKEN, raising=False)
    monkeypatch.delenv("RANK", raising=False)
    monkeypatch.delenv("LOCAL_RANK", raising=False)
    monkeypatch.setenv("RESEARCHTREE_CLIENT_ID", "test-client")
    monkeypatch.setattr(tokens, "config_dir", lambda: tmp_path / "config")
    monkeypatch.setattr(tokens, "_keyring", lambda: None)


@pytest.fixture(autouse=True)
def korean_messages():
    """Message assertions are written against the Korean table; test_i18n covers English."""
    set_locale("ko")
    yield
    set_locale(None)
