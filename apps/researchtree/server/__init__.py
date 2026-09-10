"""`researchtree serve`: serve the built viewer on 127.0.0.1 and relay GitHub calls."""

from __future__ import annotations

from http.server import ThreadingHTTPServer
from pathlib import Path

from .app import STATIC_DIR, App
from .handler import SESSION_HEADER, Handler

__all__ = ["STATIC_DIR", "SESSION_HEADER", "App", "Handler", "make_server", "url_of"]


def make_server(repo: str | None, port: int = 0, static_dir: Path = STATIC_DIR) -> tuple[ThreadingHTTPServer, App]:
    app = App(repo, static_dir)
    handler = type("BoundHandler", (Handler,), {"app": app})
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.daemon_threads = True
    app.port = httpd.server_address[1]
    return httpd, app


def url_of(app: App) -> str:
    return f"http://127.0.0.1:{app.port}/"
