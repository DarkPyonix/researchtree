# Monorepo structure

ResearchTree is an npm workspaces monorepo. We don't use pnpm, and the Python side uses uv. `pyproject.toml` sits at the repo root, so you can install it right away with `pip install git+https://github.com/DarkPyonix/researchtree`.

## Directories

Each project lives one level down under `apps/`, side by side, and the tests follow the same names under the root `tests/`. We don't add wrapper folders in between.

```
researchtree/
├─ README.md · LICENSE
├─ package.json · package-lock.json   # npm workspaces, root scripts
├─ pyproject.toml                     # Python package (kept at the root so git installs work)
├─ build.py                           # hatch hook that builds the viewer during the wheel build when static/ is missing
├─ tsconfig.base.json
├─ docs/
│  ├─ locale/                         # README translations
│  └─ guide/                          # this guide (VitePress, @researchtree/guide)
├─ apps/
│  ├─ core/                           # shared TS logic
│  ├─ ui/                             # everything browser-side: screens, views, hosts, entries, build
│  ├─ extension/                      # VS Code extension host
│  ├─ proxy/                          # Cloudflare Worker (OAuth token exchange)
│  └─ researchtree/                   # Python package
└─ tests/                             # same names and structure as apps/
```

## Packages

| Path | Package | What's inside |
|---|---|---|
| [`apps/core`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core) | `@researchtree/core` | the `Host` interface (`host.ts`), GitHub client (`github.ts`), PR-body parser (`prbody.ts`), tree builder (`tree.ts`), branch settings (`config.ts`), Korean/English UI strings (`i18n/`), extension message types (`extension-protocol.ts`) |
| [`apps/ui`](https://github.com/DarkPyonix/researchtree/tree/main/apps/ui) | `@researchtree/ui` | app shell (`app.ts`), screens (`screens.ts`), panel (`panel/`), views (`views/tree3d.ts` three.js islands (3D and flat view), `views/layout.ts` time-axis layout, `views/view.ts` view interface), hosts (`hosts/web.ts`, `local.ts`, `extension.ts`), entries (`main.web.ts`, `main.local.ts`, `main.extension.ts`), the Vite build |
| [`apps/extension`](https://github.com/DarkPyonix/researchtree/tree/main/apps/extension) | `researchtree` (`darkpyonix.researchtree`) | `extension.ts` (webview panel, auth, status bar), `rpc.ts` (webview message handling), `git.ts` (repo inference, checkout and diff through the built-in Git API) |
| [`apps/proxy`](https://github.com/DarkPyonix/researchtree/tree/main/apps/proxy) | `@researchtree/proxy` | a Worker with a single `POST /token` |
| [`apps/researchtree`](https://github.com/DarkPyonix/researchtree/tree/main/apps/researchtree) | PyPI `researchtree` | `cli.py`, `git.py`, `github/` (`api.py` REST, `auth.py` Device Flow, `tokens.py` token storage), `experiment/` (`body.py` PR-body rules, `tracking.py` `rt.log`/`set`/`conclude`), `server/` (`app.py` run state, `handler.py` HTTP, relaying and security, `static/` the viewer build · gitignored) |
| `docs/guide` | `@researchtree/guide` | this documentation site |

## Test directories

```
tests/
├─ vitest.config.ts · tsconfig.json
├─ core/                # prbody, tree, github (vitest)
├─ extension/           # rpc (vitest)
├─ proxy/               # proxy (vitest)
├─ researchtree/        # pytest: experiment/ · github/ · server/
└─ fixtures/            # prbody-cases.json (shared by TS and Python) · prs-sample.json (tree rules)
```

## Commands

Run these from the project root.

```bash
npm install                 # install dependencies (every workspace)
npm test                    # vitest (config: tests/vitest.config.ts)
npm run typecheck           # type-check core, ui, proxy, extension, tests
npm run dev                 # web dev server at http://localhost:5173
npm run build               # web + local + extension builds (all from apps/ui)
npm run build:web           # apps/ui/dist/ (GitHub Pages)
npm run build:local         # apps/researchtree/server/static/
npm run build:extension     # apps/extension/media/ + dist/extension.js
npm run package:extension   # .vsix
npm run docs:dev            # dev server for this guide
npm run docs:build          # build this guide → docs/guide/.vitepress/dist

uv run pytest               # Python tests (= npm run test:py)
uv build                    # Python wheel (run npm run build:local first, or let the build hook do it)
```

Before you finish a change, please run the tests and the type check for every package you touched.
