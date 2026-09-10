"""Command line entry point: serve / login / logout / open."""

from __future__ import annotations

import argparse
import os
import re
import sys
import threading
import urllib.parse
import webbrowser

from . import __version__, git
from .github import auth, tokens

WEB_VIEWER = "https://darkpyonix.github.io/researchtree/"
DEFAULT_PORT = 7337
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _repo_arg(value: str) -> str:
    if not REPO_RE.match(value):
        raise argparse.ArgumentTypeError("owner/name 형식이어야 합니다.")
    return value


def cmd_serve(args: argparse.Namespace) -> int:
    from .server import STATIC_DIR, make_server, url_of

    repo = args.repo or git.origin_repo()
    try:
        httpd, app = make_server(repo, DEFAULT_PORT if args.port is None else args.port)
    except OSError:
        if args.port is not None:
            print(f"포트 {args.port}을(를) 열 수 없습니다.", file=sys.stderr)
            return 1
        httpd, app = make_server(repo, 0)  # default port busy: pick a free one

    url = url_of(app) + (f"?repo={urllib.parse.quote(repo, safe='/')}" if repo else "")
    print(f"ResearchTree: {url}")
    if repo:
        print(f"기본 레포: {repo}")
    if not (STATIC_DIR / "index.html").is_file():
        print("주의: 뷰어 빌드 파일(static/)이 없습니다. README의 빌드 방법을 참고하세요.", file=sys.stderr)
    print("종료하려면 Ctrl+C를 누르세요.")
    if not args.no_browser:
        threading.Timer(0.3, webbrowser.open, (url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
    finally:
        httpd.server_close()
    return 0


def cmd_login(_: argparse.Namespace) -> int:
    try:
        auth.terminal_login()
    except auth.AuthError as e:
        print(f"로그인 실패: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n취소했습니다.", file=sys.stderr)
        return 130
    return 0


def cmd_logout(_: argparse.Namespace) -> int:
    tokens.delete_token()
    print("저장된 토큰을 삭제했습니다.")
    if os.environ.get(tokens.ENV_TOKEN):
        print(f"{tokens.ENV_TOKEN} 환경변수는 그대로 남아 있습니다.")
    return 0


def cmd_open(args: argparse.Namespace) -> int:
    repo = args.repo or git.origin_repo()
    if not repo:
        print("현재 디렉토리에서 GitHub origin remote를 찾지 못했습니다. --repo owner/name을 지정하세요.", file=sys.stderr)
        return 1
    url = f"{WEB_VIEWER}?repo={urllib.parse.quote(repo, safe='/')}"
    print(url)
    webbrowser.open(url)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="researchtree", description="Git 브랜치와 PR로 만드는 실험 트리 뷰어")
    p.add_argument("--version", action="version", version=f"researchtree {__version__}")
    sub = p.add_subparsers(dest="command", metavar="<command>")

    s = sub.add_parser("serve", help="로컬에서 뷰어를 띄운다")
    s.add_argument("--repo", type=_repo_arg, help="처음 열 레포 (owner/name)")
    s.add_argument("--port", type=int, help=f"포트 (기본 {DEFAULT_PORT})")
    s.add_argument("--no-browser", action="store_true", help="브라우저를 열지 않는다")
    s.set_defaults(func=cmd_serve)

    sub.add_parser("login", help="터미널에서 GitHub Device Flow로 로그인한다").set_defaults(func=cmd_login)
    sub.add_parser("logout", help="저장된 토큰을 삭제한다").set_defaults(func=cmd_logout)

    o = sub.add_parser("open", help="현재 레포의 트리를 중앙 웹 뷰어에서 연다")
    o.add_argument("--repo", type=_repo_arg, help="레포 (owner/name)")
    o.set_defaults(func=cmd_open)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
