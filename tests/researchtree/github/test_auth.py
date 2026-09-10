from __future__ import annotations

import pytest

from researchtree.github import auth, tokens


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        return self.t


def fake_github(responses: list[dict]):
    calls: list[tuple[str, dict]] = []

    def post(url: str, data: dict) -> dict:
        calls.append((url, data))
        if url == auth.DEVICE_CODE_URL:
            return {
                "device_code": "dev",
                "user_code": "ABCD-1234",
                "verification_uri": "https://github.com/login/device",
                "expires_in": 900,
                "interval": 5,
            }
        return responses.pop(0)

    return post, calls


def test_device_flow_state_machine(monkeypatch):
    post, calls = fake_github(
        [{"error": "authorization_pending"}, {"error": "slow_down", "interval": 10}, {"access_token": "tok"}]
    )
    monkeypatch.setattr(auth, "_post_form", post)
    clock = Clock()
    flow = auth.DeviceFlow(clock=clock)
    code = flow.start()
    assert code.user_code == "ABCD-1234"
    assert calls[0][1] == {"client_id": "test-client", "scope": "repo"}

    # Polling before the interval elapses must not hit GitHub.
    assert flow.poll() == {"status": "pending", "interval": 5}
    assert len(calls) == 1

    clock.t += 5
    assert flow.poll()["status"] == "pending"
    clock.t += 5
    assert flow.poll() == {"status": "pending", "interval": 10}  # slow_down raised the interval
    clock.t += 5
    assert flow.poll()["status"] == "pending"
    assert len(calls) == 3  # still waiting out the longer interval
    clock.t += 5
    assert flow.poll() == {"status": "ok"}
    assert flow.token == "tok"
    assert calls[-1][1]["grant_type"] == "urn:ietf:params:oauth:grant-type:device_code"


def test_slow_down_without_interval_adds_five(monkeypatch):
    post, _ = fake_github([{"error": "slow_down"}])
    monkeypatch.setattr(auth, "_post_form", post)
    flow = auth.DeviceFlow(clock=Clock())
    flow.start()
    assert flow.poll(force=True) == {"status": "pending", "interval": 10}


@pytest.mark.parametrize("error,status", [("expired_token", "expired"), ("access_denied", "denied")])
def test_device_flow_terminal_errors(monkeypatch, error, status):
    post, _ = fake_github([{"error": error}])
    monkeypatch.setattr(auth, "_post_form", post)
    flow = auth.DeviceFlow(clock=Clock())
    flow.start()
    assert flow.poll(force=True)["status"] == status
    assert flow.poll(force=True)["status"] == "expired"  # flow is over


def test_device_flow_local_expiry(monkeypatch):
    post, calls = fake_github([])
    monkeypatch.setattr(auth, "_post_form", post)
    clock = Clock()
    flow = auth.DeviceFlow(clock=clock)
    flow.start()
    clock.t += 901
    assert flow.poll()["status"] == "expired"
    assert len(calls) == 1


def test_missing_client_id(monkeypatch):
    monkeypatch.delenv("RESEARCHTREE_CLIENT_ID")
    monkeypatch.setattr(auth, "DEFAULT_CLIENT_ID", "")
    with pytest.raises(auth.AuthError, match="client ID"):
        auth.DeviceFlow().start()


def test_terminal_login(monkeypatch):
    post, _ = fake_github([{"error": "authorization_pending"}, {"access_token": "tok"}])
    monkeypatch.setattr(auth, "_post_form", post)
    monkeypatch.setattr(auth, "fetch_user", lambda t: {"login": "alice"})
    lines: list[str] = []
    user = auth.terminal_login(sleep=lambda s: None, out=lines.append)
    assert user["login"] == "alice"
    assert any("ABCD-1234" in line for line in lines)
    assert tokens.load_token() == "tok"
