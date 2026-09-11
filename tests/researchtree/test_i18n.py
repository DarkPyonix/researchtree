from __future__ import annotations

import string

import pytest

from researchtree import i18n
from researchtree.i18n import detect_locale, set_locale, t
from researchtree.i18n.en import EN
from researchtree.i18n.ko import KO


def _fields(text: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


def test_tables_have_the_same_keys_and_placeholders():
    assert KO.keys() == EN.keys()
    for key in EN:
        assert _fields(KO[key]) == _fields(EN[key]), key


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        ({"RESEARCHTREE_LANG": "en", "LANG": "ko_KR.UTF-8"}, "en"),
        ({"RESEARCHTREE_LANG": "ko", "LANG": "en_US.UTF-8"}, "ko"),
        ({"LANG": "ko_KR.UTF-8"}, "ko"),
        ({"LC_ALL": "en_US.UTF-8", "LANG": "ko_KR.UTF-8"}, "en"),
        ({"LC_ALL": "C", "LANG": "ko_KR.UTF-8"}, "ko"),
        ({"LANG": "de_DE.UTF-8"}, "en"),
    ],
)
def test_detect_locale_from_env(env, expected):
    assert detect_locale(env) == expected


def test_detect_locale_falls_back_to_english(monkeypatch):
    monkeypatch.setattr(i18n, "_windows_ui_language", lambda: None)
    monkeypatch.setattr(i18n._locale, "getlocale", lambda: (None, None))
    assert detect_locale({}) == "en"


def test_messages_follow_the_locale():
    set_locale("en")
    assert t("release.tagExists", tag="research/v3") == EN["release.tagExists"].format(tag="research/v3")
    assert t("spec.kind.added") == EN["spec.kind.added"]
    set_locale("ko")
    assert t("spec.kind.added") == KO["spec.kind.added"]
