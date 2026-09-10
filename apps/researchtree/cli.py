"""Command line entry point: serve / login / logout / open / memory / release."""

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


def cmd_memory(args: argparse.Namespace) -> int:
    """Print the research memory: the manifest, one island or experiment, alerts, or JSON."""
    import json

    from . import memory
    from .github import api

    try:
        research = memory.load(args.repo)
    except (ValueError, api.GitHubError) as e:
        print(f"트리를 불러오지 못했습니다: {e}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps(research.to_dict(), ensure_ascii=False, indent=2))
    elif args.check:
        for alert in research.check():
            print(alert)
    elif args.name:
        try:
            print(research[args.name].describe())
        except KeyError as e:
            print(e, file=sys.stderr)
            return 1
    else:
        print(research.manifest())
    return 0


def cmd_release(args: argparse.Namespace) -> int:
    """Cut the next research version: plan by default, archive/tag/push/delete with --yes."""
    from . import memory
    from .experiment import release
    from .github import api
    from .memory.build import VERSION_RE, version_tag

    g = release.Git()
    if not g.ok("rev-parse", "--git-dir"):
        print("git 저장소 안에서 실행하세요.", file=sys.stderr)
        return 1
    try:
        research = memory.load(args.repo)
        g.run("fetch", args.remote, "--prune", "--tags")
        exists, merged = release.remote_checks(g, args.remote, research.root_branch)
        steps = release.plan(research, exists=exists, merged=merged)
        version = args.version or release.next_version(research)
        if not VERSION_RE.match(version):
            print(f"버전 이름은 v2, v2.1 같은 형식이어야 합니다: {version}", file=sys.stderr)
            return 1
        print(release.describe(steps, version_tag(research.root_branch, version)))
        if not args.yes:
            print("\n계획만 보여줬습니다. 실행하려면 --yes를 붙이세요.")
            return 0
        tag = release.execute(research, steps, version, git=g, remote=args.remote)
    except (ValueError, api.GitHubError, release.ReleaseError) as e:
        print(f"버전을 내지 못했습니다: {e}", file=sys.stderr)
        return 1
    print(f"완료: {tag}")
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

    m = sub.add_parser("memory", help="PR 트리를 에이전트용 기억으로 출력한다 (요약 → 섬 → 실험)")
    m.add_argument("name", nargs="?", help="버전(v3) 또는 실험 이름을 주면 그 카드만 출력")
    m.add_argument("--repo", type=_repo_arg, help="레포 (owner/name)")
    m.add_argument("--check", action="store_true", help="규칙 검사 결과(경고)만 출력")
    m.add_argument("--json", action="store_true", help="트리 전체를 JSON으로 출력")
    m.set_defaults(func=cmd_memory)

    r = sub.add_parser("release", help="새 research 버전을 내고 끝난 실험 브랜치를 정리한다 (기본은 계획만 출력)")
    r.add_argument("version", nargs="?", help="버전 이름 (기본: 마지막 버전의 다음 번호)")
    r.add_argument("--repo", type=_repo_arg, help="레포 (owner/name)")
    r.add_argument("--remote", default="origin", help="git remote (기본 origin)")
    r.add_argument("--yes", action="store_true", help="계획대로 실행한다 (보관 머지, 태그, push, 브랜치 삭제)")
    r.set_defaults(func=cmd_release)
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
