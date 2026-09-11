"""Korean and English messages for the CLI, the local server and the training-script warnings.

The language comes from RESEARCHTREE_LANG, then LC_ALL / LC_MESSAGES / LANG, then the operating
system's display language; anything that is not Korean gets English. Output meant for agents (the
memory manifest, experiment cards, JSON) stays in English whatever the language.
"""

from __future__ import annotations

import locale as _locale
import os
import sys
from typing import Any, Mapping

from .en import EN
from .ko import KO

LOCALES = ("ko", "en")
_TABLES: dict[str, Mapping[str, str]] = {"ko": KO, "en": EN}
_current: str | None = None


def _from_tag(tag: str | None) -> str | None:
    """`ko_KR.UTF-8`, `ko-KR`, `Korean_Korea.949` -> "ko"; other real locales -> "en"; unset or C -> None."""
    if not tag:
        return None
    tag = tag.strip()
    if not tag or tag.upper() in ("C", "POSIX") or tag.upper().startswith(("C.", "POSIX.")):
        return None
    return "ko" if tag.lower().startswith(("ko", "korean")) else "en"


def _windows_ui_language() -> str | None:
    try:
        import ctypes

        lang_id = ctypes.windll.kernel32.GetUserDefaultUILanguage()  # type: ignore[attr-defined]
    except Exception:  # not Windows, or no kernel32
        return None
    return "ko" if lang_id & 0x3FF == 0x12 else "en"  # 0x12: primary language id of Korean


def detect_locale(env: Mapping[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    explicit = (env.get("RESEARCHTREE_LANG") or "").strip().lower()
    if explicit in LOCALES:
        return explicit
    for name in ("LC_ALL", "LC_MESSAGES", "LANG"):
        found = _from_tag(env.get(name))
        if found:
            return found
    if sys.platform == "win32":
        found = _windows_ui_language()
        if found:
            return found
    try:
        found = _from_tag(_locale.getlocale()[0])
    except ValueError:
        found = None
    return found or "en"


def get_locale() -> str:
    global _current
    if _current is None:
        _current = detect_locale()
    return _current


def set_locale(locale: str | None) -> None:
    """Force a language ("ko" or "en"), or None to detect it again."""
    global _current
    _current = locale if locale in LOCALES else None


def t(key: str, **params: Any) -> str:
    text = _TABLES[get_locale()].get(key) or EN[key]
    return text.format(**params) if params else text


__all__ = ["LOCALES", "detect_locale", "get_locale", "set_locale", "t"]
