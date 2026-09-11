"""HTTP handler: Host/session checks, static files, local API routes and the GitHub relay."""

from __future__ import annotations

import hmac
import html
import json
import os
import urllib.parse
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import TYPE_CHECKING, Any

from ..github import api, auth, tokens
from ..i18n import t

if TYPE_CHECKING:
    from .app import App

SESSION_HEADER = "X-ResearchTree-Session"
MAX_BODY = 5 * 1024 * 1024
RELAY_HEADERS = ("etag", "link", "content-type")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
}

NO_STATIC_PAGE = """<!doctype html>
<meta charset="utf-8"><title>ResearchTree</title>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;line-height:1.6">
<h1>{title}</h1>
<p>{body}</p>
<pre>npm install
npm run build:local</pre>
<p>{wheel}</p>
</body>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "researchtree"
    sys_version = ""
    app: App  # injected via a subclass in make_server

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass

    # ------------------------------------------------------------ response helpers

    def _send(self, status: int, body: bytes, content_type: str, headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, data: Any) -> None:
        self._send(status, json.dumps(data, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def _error(self, status: int, message: str) -> None:
        self._json(status, {"error": message})

    # ------------------------------------------------------------ entry points

    def do_GET(self) -> None:
        self._dispatch()

    def do_POST(self) -> None:
        self._dispatch()

    def do_PATCH(self) -> None:
        self._dispatch()

    def do_PUT(self) -> None:
        self._dispatch()

    def do_DELETE(self) -> None:
        self._dispatch()

    def do_HEAD(self) -> None:
        self._dispatch()

    def do_OPTIONS(self) -> None:
        self._dispatch()

    def _dispatch(self) -> None:
        # DNS rebinding guard: reject any request addressed to another host name (static files included).
        if self.headers.get("Host", "") not in self.app.allowed_hosts:
            self._error(403, t("server.badHost"))
            return
        url = urllib.parse.urlsplit(self.path)
        try:
            if url.path == "/api" or url.path.startswith("/api/"):
                self._api(url)
            elif self.command in ("GET", "HEAD"):
                self._static(url.path)
            else:
                self._error(405, t("server.badMethod"))
        except Exception as e:  # noqa: BLE001
            self._error(500, t("server.error", error=e))

    # ------------------------------------------------------------ static files

    def _index(self) -> None:
        index = self.app.static_dir / "index.html"
        if not index.is_file():
            page = NO_STATIC_PAGE.format(title=t("server.noBuildTitle"), body=t("server.noBuildBody"), wheel=t("server.noBuildWheel"))
            self._send(200, page.encode(), MIME[".html"])
            return
        text = index.read_text(encoding="utf-8")
        meta = f'<meta name="researchtree-session" content="{html.escape(self.app.session)}" />'
        text = text.replace("<head>", f"<head>\n    {meta}", 1) if "<head>" in text else meta + text
        self._send(200, text.encode(), MIME[".html"])

    def _static(self, path: str) -> None:
        rel = urllib.parse.unquote(path).lstrip("/")
        if not rel or rel == "index.html":
            self._index()
            return
        root = self.app.static_dir.resolve()
        target = (root / rel).resolve()
        if target.is_relative_to(root) and target.is_file():
            self._send(200, target.read_bytes(), MIME.get(target.suffix.lower(), "application/octet-stream"))
            return
        if Path(rel).suffix:  # missing asset, not an SPA route
            self._send(404, b"Not Found", MIME[".txt"])
            return
        self._index()  # SPA route

    # ------------------------------------------------------------ API

    def _read_body(self) -> bytes | None:
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError(t("server.bodyTooLarge"))
        return self.rfile.read(n) if n > 0 else None

    def _api(self, url: urllib.parse.SplitResult) -> None:
        sent = self.headers.get(SESSION_HEADER, "")
        if not hmac.compare_digest(sent.encode(), self.app.session.encode()):
            self._error(403, t("server.badSession"))
            return

        path, method = url.path, self.command
        if path.startswith("/api/github/"):
            self._relay(path[len("/api/github") :], url.query)
            return

        routes = {
            ("GET", "/api/context"): self._context,
            ("GET", "/api/auth"): self._auth,
            ("POST", "/api/auth/device"): self._device_start,
            ("GET", "/api/auth/device/poll"): self._device_poll,
            ("POST", "/api/auth/logout"): self._logout,
        }
        handler = routes.get((method, path))
        if handler:
            handler()
        elif any(p == path for (_, p) in routes):
            self._error(405, t("server.badMethod"))
        else:
            self._error(404, t("server.unknownApi"))

    def _context(self) -> None:
        self._json(200, {"repo": self.app.repo})

    def _user_json(self, u: dict[str, Any] | None) -> dict[str, Any]:
        if not u:
            return {"logged_in": False, "login": None, "avatar_url": None}
        return {"logged_in": True, "login": u.get("login"), "avatar_url": u.get("avatar_url"), "name": u.get("name")}

    def _auth(self) -> None:
        try:
            self._json(200, self._user_json(self.app.user()))
        except api.GitHubError as e:
            self._error(502, str(e))

    def _device_start(self) -> None:
        try:
            code = self.app.flow.start()
        except auth.AuthError as e:
            self._error(400, str(e))
            return
        self._json(
            200,
            {
                "user_code": code.user_code,
                "verification_uri": code.verification_uri,
                "expires_in": code.expires_in,
                "interval": code.interval,
            },
        )

    def _device_poll(self) -> None:
        flow = self.app.flow
        try:
            res = flow.poll()
        except auth.AuthError as e:
            self._error(400, str(e))
            return
        if res["status"] == "ok" and flow.token:
            token = flow.token
            self.app.flow = auth.DeviceFlow()
            tokens.store_token(token)
            self.app.forget_user()
            try:
                res = {"status": "ok", **self._user_json(self.app.user())}
            except api.GitHubError:
                res = {"status": "ok"}
        self._json(200, res)

    def _logout(self) -> None:
        tokens.delete_token()
        self.app.forget_user()
        self._json(200, {"ok": True, "env_token": bool(os.environ.get(tokens.ENV_TOKEN))})

    def _relay(self, api_path: str, query: str) -> None:
        if self.command not in api.ALLOWED_METHODS:
            self._error(405, t("server.badMethod"))
            return
        try:
            api.assert_api_path(api_path)
            api.assert_api_path(urllib.parse.unquote(api_path))
        except ValueError as e:
            self._error(400, str(e))
            return

        body = self._read_body()
        headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if body:
            try:
                json.loads(body)
            except ValueError:
                self._error(400, t("server.notJson"))
                return
            headers["Content-Type"] = "application/json"
        if etag := self.headers.get("If-None-Match"):
            headers["If-None-Match"] = etag

        url = api.API + api_path + (f"?{query}" if query else "")
        res = api.raw_request(self.command, url, token=tokens.load_token(), body=body, headers=headers)
        out = {k: res.headers[k] for k in RELAY_HEADERS if k in res.headers and k != "content-type"}
        ctype = res.headers.get("content-type", "application/json; charset=utf-8")
        if res.status in (204, 304):
            self.send_response(res.status)
            for k, v in out.items():
                self.send_header(k, v)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return
        self._send(res.status, res.body, ctype, out)
