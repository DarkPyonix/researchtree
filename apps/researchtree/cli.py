"""Command line entry point: serve / login / logout / open / memory / release / spec / skill."""

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


_CHANGE_LABELS = {"added": "추가", "changed": "수정", "renamed": "이름 변경", "removed": "삭제"}


def _section_label(key: str, title: str) -> str:
    return f"{title or '(머리말)'}  [{key}]" if key else "(머리말)"


def _changes_lines(changes: list) -> list[str]:
    import difflib

    if not changes:
        return ["바뀐 섹션이 없습니다."]
    lines: list[str] = []
    for c in changes:
        lines.append(f"{_CHANGE_LABELS[c.kind]}: {_section_label(c.key, c.title)}")
        if c.kind in ("changed", "added", "removed"):
            before = c.before.body.splitlines() if c.before else []
            after = c.after.body.splitlines() if c.after else []
            lines.extend(f"    {line}" for line in list(difflib.unified_diff(before, after, lineterm="", n=1))[2:])
    return lines


def _spec_lines(args: argparse.Namespace, research) -> list[str]:
    """What `researchtree spec` prints. Raises LookupError for a missing document."""
    from .memory.spec import check_spec, parse_claims

    version = research.version(args.version) if args.version else research.latest
    if args.claims:
        intent = research.intent(version)
        titles = parse_claims(intent.text) if intent else {}
        claims = research.claims()
        lines = []
        for cid in sorted(set(titles) | set(claims)):
            lines.append(f"{cid}. {titles.get(cid, '(INTENT에 없는 주장)')}")
            lines.extend(f"    {e.status:<8} {e.name}  {e.hypothesis or ''}" for e in claims.get(cid, []))
            if cid not in claims:
                lines.append("    (이 주장을 검증한 실험이 아직 없습니다)")
        return lines or ["주장이 없습니다. INTENT의 주장 제목(N1. …)이나 PR YAML의 claims를 확인하세요."]
    if args.experiment:
        e = research.experiment(args.experiment)
        return [f"{e.name}: 갈라진 지점 대비 스펙 변경 ({research.spec_path})", *_changes_lines(e.spec_changes())]
    if args.history:
        hist = research.spec_history(args.history)
        if not hist:
            return [f"'{args.history}' 섹션을 어느 버전에서도 찾지 못했습니다."]
        return [
            f"{v.name:<8} {_CHANGE_LABELS[kind]}" + (f"   합쳐진 실험: {', '.join(v.merged.names)}" if v.merged else "") for v, kind in hist
        ]
    doc = research.intent(version) if args.intent else version.spec()
    path = research.intent_path if args.intent else research.spec_path
    if doc is None:
        raise LookupError(f"{version.name}에 {path} 파일이 없습니다. (.researchtree.yml의 spec / intent로 경로를 바꿀 수 있습니다)")
    if args.check:
        labels = {"missing-include": "include를 읽지 못함", "no-summary": "요약 줄(>) 없음", "too-long": "너무 김"}
        issues = check_spec(doc.sections, doc.missing)
        return [
            f"{labels[i['kind']]}: {i.get('path') or i.get('key')}" + (f" ({i['lines']}줄)" if i["kind"] == "too-long" else "") for i in issues
        ] or ["문제 없음"]
    if args.diff is not None:
        other = research.version(args.diff) if args.diff else version.previous
        before = other.spec() if other else None
        return [f"{other.name if other else '(없음)'} → {version.name}  ({path})", *_changes_lines(doc.diff(before))]
    return [doc.summary()] if args.summary else [doc.text]


def cmd_spec(args: argparse.Namespace) -> int:
    """Print the spec (or intent) of a version, its changes, a section's history, checks or claims."""
    from . import memory
    from .github import api

    try:
        lines = _spec_lines(args, memory.load(args.repo))
    except KeyError as e:  # unknown version or experiment name
        print(e.args[0] if e.args else e, file=sys.stderr)
        return 1
    except LookupError as e:  # no spec / intent file at that version
        print(e, file=sys.stderr)
        return 1
    except (ValueError, api.GitHubError) as e:
        print(f"스펙을 읽지 못했습니다: {e}", file=sys.stderr)
        return 1
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(f"{line}\n" for line in lines)
        print(f"저장했습니다: {args.out}")
    else:
        for line in lines:
            print(line)
    return 0


def cmd_skill_install(args: argparse.Namespace) -> int:
    """Install the bundled SKILL.md into this repository's .claude/skills and/or .agents/skills."""
    from pathlib import Path

    from . import skill

    top = git.toplevel(args.path)
    if top is None and args.path is None:
        print("git 저장소 안에서 실행하거나 --path로 설치할 폴더를 지정하세요.", file=sys.stderr)
        return 1
    root = Path(top or args.path)
    targets = list(skill.TARGETS) if args.target == "all" else [args.target] if args.target else skill.default_targets(root)
    labels = {"installed": "설치", "updated": "갱신", "unchanged": "이미 최신"}
    for path, result in skill.install(root, targets):
        print(f"{labels[result]}: {path.relative_to(root).as_posix()}")
    return 0


def cmd_skill_show(_: argparse.Namespace) -> int:
    from . import skill

    sys.stdout.write(skill.text())
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

    sp = sub.add_parser("spec", help="버전의 스펙(또는 의도) 문서와 그 변경, 섹션 이력, 주장별 실험을 출력한다")
    sp.add_argument("version", nargs="?", help="버전 이름 (기본: 최신 버전)")
    sp.add_argument("--repo", type=_repo_arg, help="레포 (owner/name)")
    sp.add_argument("--intent", action="store_true", help="스펙 대신 의도 문서(INTENT.md)를 다룬다")
    sp.add_argument("--summary", action="store_true", help="섹션 제목과 요약 줄만 출력한다")
    sp.add_argument("--diff", nargs="?", const="", metavar="VERSION", help="다른 버전(기본: 직전 버전) 대비 섹션 변경")
    sp.add_argument("--check", action="store_true", help="요약 줄 없음, 너무 긴 섹션, 읽지 못한 include를 알려준다")
    sp.add_argument("--history", metavar="KEY", help="섹션 하나가 추가·수정된 버전들")
    sp.add_argument("--experiment", metavar="NAME", help="실험 하나가 갈라진 지점 대비 스펙에서 바꾼 섹션")
    sp.add_argument("--claims", action="store_true", help="의도 문서의 주장별로 그 주장을 검증한 실험")
    sp.add_argument("--out", metavar="FILE", help="출력을 파일로 저장한다")
    sp.set_defaults(func=cmd_spec)

    sk = sub.add_parser("skill", help="코딩 에이전트용 ResearchTree 스킬(SKILL.md)을 설치한다")
    sks = sk.add_subparsers(dest="skill_command", metavar="<command>")
    si = sks.add_parser("install", help="현재 레포의 .claude/skills, .agents/skills에 설치한다 (이미 있는 폴더 기준, 둘 다 없으면 둘 다)")
    si.add_argument("--target", choices=["claude", "agents", "all"], help="설치 위치 (기본: 레포에 있는 폴더)")
    si.add_argument("--path", help="git 저장소 대신 이 폴더에 설치한다")
    si.set_defaults(func=cmd_skill_install)
    sks.add_parser("show", help="스킬 내용을 출력한다").set_defaults(func=cmd_skill_show)
    sk.set_defaults(func=lambda _: (sk.print_help(), 1)[1])
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
