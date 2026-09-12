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
from .i18n import t

WEB_VIEWER = "https://darkpyonix.github.io/researchtree/"
DEFAULT_PORT = 7337
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _repo_arg(value: str) -> str:
    if not REPO_RE.match(value):
        raise argparse.ArgumentTypeError(t("cli.repoFormat"))
    return value


def cmd_serve(args: argparse.Namespace) -> int:
    from .server import STATIC_DIR, make_server, url_of

    repo = args.repo or git.origin_repo()
    try:
        httpd, app = make_server(repo, DEFAULT_PORT if args.port is None else args.port)
    except OSError:
        if args.port is not None:
            print(t("serve.portBusy", port=args.port), file=sys.stderr)
            return 1
        httpd, app = make_server(repo, 0)  # default port busy: pick a free one

    url = url_of(app) + (f"?repo={urllib.parse.quote(repo, safe='/')}" if repo else "")
    print(f"ResearchTree: {url}")
    if repo:
        print(t("serve.defaultRepo", repo=repo))
    if not (STATIC_DIR / "index.html").is_file():
        print(t("serve.noStatic"), file=sys.stderr)
    print(t("serve.stopHint"))
    if not args.no_browser:
        threading.Timer(0.3, webbrowser.open, (url,)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n" + t("serve.stopped"))
    finally:
        httpd.server_close()
    return 0


def cmd_login(_: argparse.Namespace) -> int:
    try:
        auth.terminal_login()
    except auth.AuthError as e:
        print(t("login.failed", error=e), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n" + t("cli.cancelled"), file=sys.stderr)
        return 130
    return 0


def cmd_logout(_: argparse.Namespace) -> int:
    tokens.delete_token()
    print(t("logout.done"))
    if os.environ.get(tokens.ENV_TOKEN):
        print(t("logout.envKept", name=tokens.ENV_TOKEN))
    return 0


def cmd_open(args: argparse.Namespace) -> int:
    repo = args.repo or git.origin_repo()
    if not repo:
        print(t("open.noOrigin"), file=sys.stderr)
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
        print(t("memory.failed", error=e), file=sys.stderr)
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
        print(t("cli.notGit"), file=sys.stderr)
        return 1
    try:
        research = memory.load(args.repo)
        g.run("fetch", args.remote, "--prune", "--tags")
        exists, merged = release.remote_checks(g, args.remote, research.root_branch)
        steps = release.plan(research, exists=exists, merged=merged)
        version = args.version or release.next_version(research)
        if not VERSION_RE.match(version):
            print(t("release.badVersion", version=version), file=sys.stderr)
            return 1
        print(release.describe(steps, version_tag(research.root_branch, version)))
        if not args.yes:
            print("\n" + t("release.planOnly"))
            return 0
        tag = release.execute(research, steps, version, git=g, remote=args.remote)
    except (ValueError, api.GitHubError, release.ReleaseError) as e:
        print(t("release.failed", error=e), file=sys.stderr)
        return 1
    print(t("release.done", tag=tag))
    return 0


def _kind(kind: str) -> str:
    return t(f"spec.kind.{kind}")


def _section_label(key: str, title: str) -> str:
    return f"{title or t('spec.preamble')}  [{key}]" if key else t("spec.preamble")


def _changes_lines(changes: list) -> list[str]:
    import difflib

    if not changes:
        return [t("spec.noChanges")]
    lines: list[str] = []
    for c in changes:
        lines.append(f"{_kind(c.kind)}: {_section_label(c.key, c.title)}")
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
            lines.append(f"{cid}. {titles.get(cid, t('spec.claimMissing'))}")
            lines.extend(f"    {e.status:<8} {e.name}  {e.hypothesis or ''}" for e in claims.get(cid, []))
            if cid not in claims:
                lines.append("    " + t("spec.claimUntested"))
        return lines or [t("spec.noClaims")]
    if args.experiment:
        e = research.experiment(args.experiment)
        return [t("spec.experimentChanges", name=e.name, path=research.spec_path), *_changes_lines(e.spec_changes())]
    if args.history:
        hist = research.spec_history(args.history)
        if not hist:
            return [t("spec.noSection", key=args.history)]
        return [
            f"{v.name:<8} {_kind(kind)}" + ("   " + t("spec.mergedIn", names=", ".join(v.merged.names)) if v.merged else "") for v, kind in hist
        ]
    doc = research.intent(version) if args.intent else version.spec()
    path = research.intent_path if args.intent else research.spec_path
    if doc is None:
        raise LookupError(t("spec.missingDoc", version=version.name, path=path))
    if args.check:
        issues = check_spec(doc.sections, doc.missing)
        return [
            f"{t('spec.issue.' + i['kind'])}: {i.get('path') or i.get('key')}" + (f" ({t('spec.lines', n=i['lines'])})" if i["kind"] == "too-long" else "")
            for i in issues
        ] or [t("spec.ok")]
    if args.diff is not None:
        other = research.version(args.diff) if args.diff else version.previous
        before = other.spec() if other else None
        return [f"{other.name if other else t('spec.none')} → {version.name}  ({path})", *_changes_lines(doc.diff(before))]
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
        print(t("spec.failed", error=e), file=sys.stderr)
        return 1
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(f"{line}\n" for line in lines)
        print(t("cli.saved", path=args.out))
    else:
        for line in lines:
            print(line)
    return 0


def _island_token() -> str | None:
    from .github import tokens

    token = tokens.load_token()
    if not token:
        print(t("island.needLogin"), file=sys.stderr)
    return token


def _island_load(args: argparse.Namespace, token: str | None):
    """The account's map, and who it belongs to."""
    from . import island_repo

    user = args.user or (island_repo.current_user(token) if token else None)
    if not user:
        print(t("island.needUser"), file=sys.stderr)
        return None, None
    return user, island_repo.load(user, token)


def cmd_island_show(args: argparse.Namespace) -> int:
    """Print the account's map, as the viewer reads it."""
    from .github import tokens

    token = tokens.load_token()
    user, settings = _island_load(args, token)
    if settings is None:
        return 1
    if not settings.exists:
        print(t("island.noSettings", repo=settings.repo))
        return 1
    for land in settings.island_map.islands:
        print(t("island.land", name=land.name, x=land.at[0], y=land.at[1]))
        for research in land.repos:
            extra = "" if research.root == "research" and research.prefix == "experiment/" else f"  ({research.root}, {research.prefix})"
            print(f"  - {research.repo}  [{research.at[0]}, {research.at[1]}]{extra}")
    if not settings.island_map.islands:
        print(t("island.empty"))
    for warning in settings.island_map.warnings:
        print(t("island.warning", text=warning), file=sys.stderr)
    return 0


def cmd_island_check(args: argparse.Namespace) -> int:
    """Say whether the map is readable, and what was dropped."""
    from .github import tokens

    user, settings = _island_load(args, tokens.load_token())
    if settings is None:
        return 1
    if not settings.exists:
        print(t("island.noSettings", repo=settings.repo), file=sys.stderr)
        return 1
    for warning in settings.island_map.warnings:
        print(t("island.warning", text=warning))
    count = len(settings.island_map.research())
    print(t("island.checked", islands=len(settings.island_map.islands), repos=count))
    return 1 if settings.island_map.warnings else 0


def cmd_island_init(args: argparse.Namespace) -> int:
    """Create the settings repository with an empty map, ready for `island add`."""
    from . import island_repo
    from .island import IslandMap

    token = _island_token()
    if not token:
        return 1
    user = args.user or island_repo.current_user(token)
    settings = island_repo.load(user, token)
    if settings.exists:
        print(t("island.alreadySet", repo=settings.repo))
        return 0
    try:
        island_repo.create_settings_repo(token, owner=user, private=args.private)
    except Exception as e:  # the repository may exist without a README
        if args.verbose:
            print(e, file=sys.stderr)
    island_repo.save(settings, IslandMap(), token, user=user, message="Add the ResearchIsland map")
    print(t("island.created", repo=settings.repo, user=user))
    return 0


def cmd_island_add(args: argparse.Namespace) -> int:
    """Put one research on the map, making its land when it is new."""
    from . import island_repo
    from .island import Land, Research, next_spot

    token = _island_token()
    if not token:
        return 1
    user = args.user or island_repo.current_user(token)
    repo = args.repo or git.origin_repo()
    if not repo or "/" not in repo:
        print(t("island.needRepo"), file=sys.stderr)
        return 1
    settings = island_repo.load(user, token)
    island_map = settings.island_map
    if island_map.find(repo):
        print(t("island.already", repo=repo), file=sys.stderr)
        return 1

    name = args.island or (island_map.islands[0].name if island_map.islands else t("island.defaultName"))
    land = next((i for i in island_map.islands if i.name == name), None)
    if land is None:
        land = Land(name=name, at=next_spot(i.at for i in island_map.islands))
        island_map.islands.append(land)
    at = (args.x, args.y) if args.x is not None and args.y is not None else next_spot(r.at for r in land.repos)
    land.repos.append(Research(repo=repo, at=at, root=args.root, prefix=args.prefix))
    island_repo.save(settings, island_map, token, user=user, message=f"Add {repo} to the ResearchIsland map")
    print(t("island.added", repo=repo, name=land.name, x=at[0], y=at[1]))
    return 0


def cmd_island_remove(args: argparse.Namespace) -> int:
    """Take one research off the map, and the land with it when it empties."""
    from . import island_repo

    token = _island_token()
    if not token:
        return 1
    user = args.user or island_repo.current_user(token)
    repo = args.repo or git.origin_repo()
    settings = island_repo.load(user, token)
    island_map = settings.island_map
    if not repo or not island_map.find(repo):
        print(t("island.notOnMap", repo=repo or "?"), file=sys.stderr)
        return 1
    for land in island_map.islands:
        land.repos = [r for r in land.repos if r.repo != repo]
    island_map.islands = [land for land in island_map.islands if land.repos]
    island_repo.save(settings, island_map, token, user=user, message=f"Remove {repo} from the ResearchIsland map")
    print(t("island.removed", repo=repo))
    return 0


def cmd_skill_install(args: argparse.Namespace) -> int:
    """Install the bundled SKILL.md into this repository's .claude/skills and/or .agents/skills."""
    from pathlib import Path

    from . import skill

    top = git.toplevel(args.path)
    if top is None and args.path is None:
        print(t("skill.needRepo"), file=sys.stderr)
        return 1
    root = Path(top or args.path)
    targets = list(skill.TARGETS) if args.target == "all" else [args.target] if args.target else skill.default_targets(root)
    for path, result in skill.install(root, targets):
        print(f"{t('skill.' + result)}: {path.relative_to(root).as_posix()}")
    return 0


def cmd_skill_show(_: argparse.Namespace) -> int:
    from . import skill

    sys.stdout.write(skill.text())
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="researchtree", description=t("cli.description"))
    p.add_argument("--version", action="version", version=f"researchtree {__version__}")
    sub = p.add_subparsers(dest="command", metavar="<command>")

    s = sub.add_parser("serve", help=t("help.serve"))
    s.add_argument("--repo", type=_repo_arg, help=t("help.serveRepo"))
    s.add_argument("--port", type=int, help=t("help.port", port=DEFAULT_PORT))
    s.add_argument("--no-browser", action="store_true", help=t("help.noBrowser"))
    s.set_defaults(func=cmd_serve)

    sub.add_parser("login", help=t("help.login")).set_defaults(func=cmd_login)
    sub.add_parser("logout", help=t("help.logout")).set_defaults(func=cmd_logout)

    o = sub.add_parser("open", help=t("help.open"))
    o.add_argument("--repo", type=_repo_arg, help=t("help.repo"))
    o.set_defaults(func=cmd_open)

    m = sub.add_parser("memory", help=t("help.memory"))
    m.add_argument("name", nargs="?", help=t("help.memoryName"))
    m.add_argument("--repo", type=_repo_arg, help=t("help.repo"))
    m.add_argument("--check", action="store_true", help=t("help.memoryCheck"))
    m.add_argument("--json", action="store_true", help=t("help.memoryJson"))
    m.set_defaults(func=cmd_memory)

    r = sub.add_parser("release", help=t("help.release"))
    r.add_argument("version", nargs="?", help=t("help.releaseVersion"))
    r.add_argument("--repo", type=_repo_arg, help=t("help.repo"))
    r.add_argument("--remote", default="origin", help=t("help.remote"))
    r.add_argument("--yes", action="store_true", help=t("help.yes"))
    r.set_defaults(func=cmd_release)

    sp = sub.add_parser("spec", help=t("help.spec"))
    sp.add_argument("version", nargs="?", help=t("help.specVersion"))
    sp.add_argument("--repo", type=_repo_arg, help=t("help.repo"))
    sp.add_argument("--intent", action="store_true", help=t("help.specIntent"))
    sp.add_argument("--summary", action="store_true", help=t("help.specSummary"))
    sp.add_argument("--diff", nargs="?", const="", metavar="VERSION", help=t("help.specDiff"))
    sp.add_argument("--check", action="store_true", help=t("help.specCheck"))
    sp.add_argument("--history", metavar="KEY", help=t("help.specHistory"))
    sp.add_argument("--experiment", metavar="NAME", help=t("help.specExperiment"))
    sp.add_argument("--claims", action="store_true", help=t("help.specClaims"))
    sp.add_argument("--out", metavar="FILE", help=t("help.specOut"))
    sp.set_defaults(func=cmd_spec)

    il = sub.add_parser("island", help=t("help.island"))
    ils = il.add_subparsers(dest="island_command", metavar="<command>")
    for name, func, helper in (("show", cmd_island_show, "help.islandShow"), ("check", cmd_island_check, "help.islandCheck")):
        c = ils.add_parser(name, help=t(helper))
        c.add_argument("--user", help=t("help.islandUser"))
        c.set_defaults(func=func)
    ii = ils.add_parser("init", help=t("help.islandInit"))
    ii.add_argument("--user", help=t("help.islandUser"))
    ii.add_argument("--private", action="store_true", help=t("help.islandPrivate"))
    ii.add_argument("--verbose", action="store_true", help=t("help.islandVerbose"))
    ii.set_defaults(func=cmd_island_init)
    ia = ils.add_parser("add", help=t("help.islandAdd"))
    ia.add_argument("repo", nargs="?", type=_repo_arg, help=t("help.repo"))
    ia.add_argument("--island", metavar="NAME", help=t("help.islandName"))
    ia.add_argument("--x", type=int, help=t("help.islandX"))
    ia.add_argument("--y", type=int, help=t("help.islandY"))
    ia.add_argument("--root", default="research", help=t("help.islandRoot"))
    ia.add_argument("--prefix", default="experiment/", help=t("help.islandPrefix"))
    ia.add_argument("--user", help=t("help.islandUser"))
    ia.set_defaults(func=cmd_island_add)
    ir = ils.add_parser("remove", help=t("help.islandRemove"))
    ir.add_argument("repo", nargs="?", type=_repo_arg, help=t("help.repo"))
    ir.add_argument("--user", help=t("help.islandUser"))
    ir.set_defaults(func=cmd_island_remove)
    il.set_defaults(func=lambda _: (il.print_help(), 1)[1])

    sk = sub.add_parser("skill", help=t("help.skill"))
    sks = sk.add_subparsers(dest="skill_command", metavar="<command>")
    si = sks.add_parser("install", help=t("help.skillInstall"))
    si.add_argument("--target", choices=["claude", "agents", "all"], help=t("help.skillTarget"))
    si.add_argument("--path", help=t("help.skillPath"))
    si.set_defaults(func=cmd_skill_install)
    sks.add_parser("show", help=t("help.skillShow")).set_defaults(func=cmd_skill_show)
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
