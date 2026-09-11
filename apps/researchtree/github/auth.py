"""GitHub OAuth Device Flow login."""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any, Callable

from ..i18n import t
from . import api, tokens

DEVICE_CODE_URL = "https://github.com/login/device/code"
TOKEN_URL = "https://github.com/login/oauth/access_token"
SCOPE = "repo"
# DarkPyonix OAuth App client ID (public value). Fill in once the app is registered with Device Flow enabled.
DEFAULT_CLIENT_ID = "Ov23liWqlCFuKF2A3ZbE"  # public client ID of the DarkPyonix ResearchTree OAuth App


class AuthError(Exception):
    pass


def client_id() -> str:
    cid = os.environ.get("RESEARCHTREE_CLIENT_ID") or DEFAULT_CLIENT_ID
    if not cid:
        raise AuthError(t("auth.noClientId", env=tokens.ENV_TOKEN))
    return cid


def fetch_user(token: str) -> dict[str, Any]:
    return api.call("GET", "/user", token=token)


# ---------------------------------------------------------------- Device Flow


def _post_form(url: str, data: dict[str, str]) -> dict[str, Any]:
    res = api.raw_request(
        "POST",
        url,
        body=urllib.parse.urlencode(data).encode(),
        headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        out = json.loads(res.body or b"{}")
    except ValueError:
        out = {}
    if res.status >= 400 and "error" not in out:
        raise AuthError(t("auth.serverStatus", status=res.status))
    return out if isinstance(out, dict) else {}


@dataclass
class DeviceCode:
    device_code: str
    user_code: str
    verification_uri: str
    expires_in: int
    interval: int


class DeviceFlow:
    """
    State of one Device Flow attempt. `poll()` asks GitHub at most once and returns
    {"status": "pending" | "ok" | "expired" | "denied", ...}.
    """

    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self._clock = clock
        self._lock = threading.Lock()
        self.code: DeviceCode | None = None
        self.interval = 5
        self._deadline = 0.0
        self._next_poll = 0.0
        self.token: str | None = None

    def start(self) -> DeviceCode:
        data = _post_form(DEVICE_CODE_URL, {"client_id": client_id(), "scope": SCOPE})
        if "device_code" not in data:
            raise AuthError(data.get("error_description") or data.get("error") or t("auth.deviceStartFailed"))
        code = DeviceCode(
            device_code=data["device_code"],
            user_code=data["user_code"],
            verification_uri=data.get("verification_uri", "https://github.com/login/device"),
            expires_in=int(data.get("expires_in", 900)),
            interval=int(data.get("interval", 5)),
        )
        with self._lock:
            self.code = code
            self.interval = code.interval
            now = self._clock()
            self._deadline = now + code.expires_in
            self._next_poll = now + code.interval
            self.token = None
        return code

    def poll(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            if self.token:
                return {"status": "ok"}
            if self.code is None:
                return {"status": "expired", "message": t("auth.noPending")}
            now = self._clock()
            if now >= self._deadline:
                self.code = None
                return {"status": "expired"}
            if not force and now < self._next_poll:
                return {"status": "pending", "interval": self.interval}

            data = _post_form(
                TOKEN_URL,
                {
                    "client_id": client_id(),
                    "device_code": self.code.device_code,
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                },
            )
            token = data.get("access_token")
            if token:
                self.token = token
                self.code = None
                return {"status": "ok"}

            err = data.get("error")
            if err == "authorization_pending":
                pass
            elif err == "slow_down":
                self.interval = int(data.get("interval") or self.interval + 5)
            elif err == "expired_token":
                self.code = None
                return {"status": "expired"}
            elif err == "access_denied":
                self.code = None
                return {"status": "denied"}
            else:
                self.code = None
                raise AuthError(data.get("error_description") or err or t("auth.unknownResponse"))
            self._next_poll = self._clock() + self.interval
            return {"status": "pending", "interval": self.interval}


def terminal_login(sleep: Callable[[float], None] = time.sleep, out: Callable[[str], None] = print) -> dict[str, Any]:
    """`researchtree login`: print the code and URL, then wait for approval."""
    flow = DeviceFlow()
    code = flow.start()
    out(t("auth.openAndEnter", uri=code.verification_uri))
    out(f"\n    {code.user_code}\n")
    while True:
        sleep(flow.interval)
        res = flow.poll(force=True)
        if res["status"] == "ok":
            break
        if res["status"] == "expired":
            raise AuthError(t("auth.expired"))
        if res["status"] == "denied":
            raise AuthError(t("auth.denied"))
    assert flow.token
    user = fetch_user(flow.token)
    where = tokens.store_token(flow.token)
    out(t("auth.signedIn", login=user.get("login"), where=where))
    return user
