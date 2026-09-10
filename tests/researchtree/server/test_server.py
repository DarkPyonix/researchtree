from __future__ import annotations

import http.client
import json
import threading

import pytest

from researchtree import server
from researchtree.github import api, auth, tokens


@pytest.fixture
def running(tmp_path, monkeypatch):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><html><head><title>t</title></head><body></body></html>")
    (static / "assets" / "app.js").write_text("console.log(1)")

    relayed: list[dict] = []

    def fake_raw_request(method, url, *, token=None, body=None, headers=None, timeout=30):
        relayed.append({"method": method, "url": url, "token": token, "body": body, "headers": headers or {}})
        if url.endswith("/user"):
            data = {"login": "alice", "avatar_url": "https://avatars.githubusercontent.com/u/1"}
        else:
            data = {"ok": True}
        return api.Response(
            200, {"content-type": "application/json", "etag": 'W/"abc"', "link": "<x>; rel=next", "set-cookie": "no"},
            json.dumps(data).encode(),
        )

    monkeypatch.setattr(api, "raw_request", fake_raw_request)
    httpd, app = server.make_server("o/r", 0, static)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield app, relayed
    httpd.shutdown()
    httpd.server_close()


def req(app, method, path, *, host=None, session=True, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", app.port, timeout=5)
    h = {"Host": host or f"127.0.0.1:{app.port}", **(headers or {})}
    if session:
        h[server.SESSION_HEADER] = app.session if session is True else session
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    conn.request(method, path, body=data, headers=h)
    res = conn.getresponse()
    raw = res.read()
    conn.close()
    return res.status, {k.lower(): v for k, v in res.getheaders()}, raw


def test_index_has_session_meta(running):
    app, _ = running
    status, headers, raw = req(app, "GET", "/", session=False)
    assert status == 200
    assert f'<meta name="researchtree-session" content="{app.session}" />' in raw.decode()
    # SPA fallback
    status, _, raw = req(app, "GET", "/some/route?repo=o/r", session=False)
    assert status == 200 and b"researchtree-session" in raw
    status, headers, _ = req(app, "GET", "/assets/app.js", session=False)
    assert status == 200 and headers["content-type"].startswith("text/javascript")
    assert req(app, "GET", "/assets/missing.js", session=False)[0] == 404


def test_path_traversal_blocked(running):
    app, _ = running
    status, _, raw = req(app, "GET", "/..%2f..%2fsecret.txt", session=False)
    assert status == 404


@pytest.mark.parametrize("host", ["evil.example:{port}", "127.0.0.1:1", "localhost", "attacker.localhost:{port}"])
def test_wrong_host_rejected(running, host):
    app, _ = running
    h = host.format(port=app.port)
    assert req(app, "GET", "/api/context", host=h)[0] == 403
    assert req(app, "GET", "/", host=h, session=False)[0] == 403  # the session token must not leak either


def test_localhost_host_allowed(running):
    app, _ = running
    assert req(app, "GET", "/api/context", host=f"localhost:{app.port}")[0] == 200


@pytest.mark.parametrize("session", [False, "wrong"])
def test_api_requires_session(running, session):
    app, relayed = running
    assert req(app, "GET", "/api/auth", session=session)[0] == 403
    assert req(app, "GET", "/api/github/user", session=session)[0] == 403
    assert relayed == []


def test_context(running):
    app, _ = running
    status, _, raw = req(app, "GET", "/api/context")
    assert status == 200 and json.loads(raw) == {"repo": "o/r"}


def test_auth_logged_out_and_in(running, monkeypatch):
    app, _ = running
    status, _, raw = req(app, "GET", "/api/auth")
    assert status == 200 and json.loads(raw)["logged_in"] is False
    monkeypatch.setenv(tokens.ENV_TOKEN, "secret-token")
    status, _, raw = req(app, "GET", "/api/auth")
    data = json.loads(raw)
    assert data["logged_in"] is True and data["login"] == "alice"
    assert b"secret-token" not in raw


def test_relay_forwards_and_filters(running, monkeypatch):
    app, relayed = running
    monkeypatch.setenv(tokens.ENV_TOKEN, "secret-token")
    status, headers, raw = req(
        app, "PATCH", "/api/github/repos/o/r/pulls/1?x=1&y=a%2Fb", body={"body": "hi"}, headers={"If-None-Match": 'W/"old"'}
    )
    assert status == 200 and json.loads(raw) == {"ok": True}
    assert headers["etag"] == 'W/"abc"' and headers["link"] == "<x>; rel=next"
    assert "set-cookie" not in headers
    assert b"secret-token" not in raw and "secret-token" not in json.dumps(headers)
    call = relayed[-1]
    assert call["url"] == "https://api.github.com/repos/o/r/pulls/1?x=1&y=a%2Fb"
    assert call["method"] == "PATCH" and call["token"] == "secret-token"
    assert json.loads(call["body"]) == {"body": "hi"}
    assert call["headers"]["If-None-Match"] == 'W/"old"'


@pytest.mark.parametrize("method", ["DELETE", "OPTIONS", "HEAD"])
def test_relay_method_allowlist(running, method):
    app, relayed = running
    assert req(app, method, "/api/github/repos/o/r")[0] == 405
    assert relayed == []


@pytest.mark.parametrize(
    "path",
    [
        "/api/github//evil.com/x",
        "/api/github/https:/evil.com",
        "/api/github/%2F%2Fevil.com",
        "/api/github/a%5Cb",
        "/api/github/https%3A%2F%2Fevil.com",
    ],
)
def test_relay_path_validation(running, path):
    app, relayed = running
    assert req(app, "GET", path)[0] == 400
    assert relayed == []


def test_relay_rejects_non_json_body(running):
    app, relayed = running
    conn = http.client.HTTPConnection("127.0.0.1", app.port, timeout=5)
    conn.request("POST", "/api/github/x", body=b"not json", headers={server.SESSION_HEADER: app.session})
    assert conn.getresponse().status == 400
    assert relayed == []


def test_device_flow_endpoints(running, monkeypatch):
    app, _ = running
    responses = [{"error": "authorization_pending"}, {"access_token": "new-token"}]

    def post(url, data):
        if url == auth.DEVICE_CODE_URL:
            return {"device_code": "d", "user_code": "WXYZ-0000", "verification_uri": "https://github.com/login/device",
                    "expires_in": 900, "interval": 0}
        return responses.pop(0)

    monkeypatch.setattr(auth, "_post_form", post)
    status, _, raw = req(app, "POST", "/api/auth/device")
    data = json.loads(raw)
    assert status == 200 and data["user_code"] == "WXYZ-0000" and "device_code" not in data
    assert json.loads(req(app, "GET", "/api/auth/device/poll")[2])["status"] == "pending"
    status, _, raw = req(app, "GET", "/api/auth/device/poll")
    data = json.loads(raw)
    assert data["status"] == "ok" and data["login"] == "alice"
    assert b"new-token" not in raw
    assert tokens.load_token() == "new-token"

    assert req(app, "POST", "/api/auth/logout")[0] == 200
    assert tokens.load_token() is None


def test_unknown_api_and_wrong_method(running):
    app, _ = running
    assert req(app, "GET", "/api/nope")[0] == 404
    assert req(app, "GET", "/api/auth/logout")[0] == 405


def test_no_static_page(tmp_path):
    httpd, app = server.make_server(None, 0, tmp_path / "missing")
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    try:
        status, _, raw = req(app, "GET", "/", session=False)
        assert status == 200 and "npm run build:local" in raw.decode()
    finally:
        httpd.shutdown()
        httpd.server_close()
