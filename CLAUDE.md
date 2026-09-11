# CLAUDE.md

Rules for working in this repository. Project overview: [PROJECT.md](PROJECT.md). Design decisions: [docs/](docs/).

## Language

- **Code comments and docstrings: English only.**
- User-facing text in the viewer and the VS Code extension (UI, toasts, error messages shown to users) goes through the i18n table (`t()` in `apps/core/src/i18n/`) with both a Korean and an English entry; never hard-code it. The Python package (CLI, local server, training-script warnings) does the same with `t()` in `apps/researchtree/i18n/`; output meant for agents (manifest, cards, JSON) stays English.
- Documents under `docs/` and `PROJECT.md`: Korean.
- Commit messages: English (see [Git](#git)).

## Research conventions the code must honor

Details: [docs/CONVENTIONS.md](docs/CONVENTIONS.md). Do not change these without updating that document first.

- Root branch is `research`, versioned with tags `research/v1`, `research/v2`, … (prefixed with the root branch name so they never clash with release tags like `v1` on `main`; bare `vN` tags are ignored); an adopted experiment merged into research gets the next tag. Experiment branches are `experiment/<name>`; research-rooted ones record `parent: research@vN`.
- `main`, `develop` and every other branch are never shown in the tree.
- One experiment = one branch = one PR. The PR body's first ```` ```yaml ```` block holds `parent`, `hypothesis`, `change`, `metrics`, `wandb`, `status`, `tags`.
- Parent: YAML `parent` first (`research@vN` hangs off that version), then PR `base.ref` (research → the latest version tagged before the PR opened). Status: YAML `status` first, then merged → adopted, closed → rejected, otherwise running.
- GitHub is the only data store. No database, no server-side cache.

## Architecture rules

- One TypeScript viewer, three hosts (central web, VS Code extension, local `uv tool` server). Everything host-specific goes through the `Host` interface in `apps/core/src/host.ts`. Tree logic, PR-body parsing and UI must stay host-agnostic.
- PR-body rewriting must be lossless: only the YAML block changes, comments and key order are preserved, unknown fields are kept, and a broken YAML block is never overwritten.
- TypeScript (`apps/core/src/prbody.ts`) and Python (`apps/researchtree/experiment/body.py`) implement the same rules. Both must pass `tests/fixtures/prbody-cases.json`. Change the fixture first, then both implementations.
- The tree rules likewise live in TypeScript (`apps/core/src/tree.ts`) and Python (`apps/researchtree/memory/build.py`). Both must turn `tests/fixtures/tree-sample.json` into `tree-expected.json`. After an intended rule change, regenerate with `RT_UPDATE_FIXTURES=1 npm test`, then update the Python port.
- The intent/spec rules (sections, includes, section changes, `.researchtree.yml`) live in `apps/core/src/spec.ts` and `apps/researchtree/memory/spec.py`, checked the same way against `tests/fixtures/spec-cases.json` → `spec-expected.json`.

## Security rules

- The GitHub token never leaves its host boundary: browser `localStorage` (web), extension host (VS Code), local Python process (local). Never send it to a webview, a log, or any domain other than `api.github.com`.
- Every GitHub call goes through `assertApiPath` (paths only, no full URLs).
- PR bodies are untrusted input. Render markdown only through `renderMarkdown` (DOMPurify). Build DOM with the `h()` helper; do not use `innerHTML` with external strings.
- No runtime scripts from CDNs. Bundle all dependencies. Keep the CSP in `apps/ui/vite.config.ts` strict.
- The auth proxy (`apps/proxy`) only exchanges OAuth codes. It must not store or log tokens, and only allows listed origins.
- The local server binds to `127.0.0.1`, checks the `Host` header, and requires the per-run session token.

## Repository layout and commands

npm workspaces (not pnpm). Python uses uv; `pyproject.toml` stays at the repo root so `pip install git+<repo>` works.

Keep the layout flat: one level of products under `apps/`, and `tests/` mirrors the `apps/` folder names. Do not add wrapper folders.

| Path | What |
|---|---|
| `apps/core` | TS shared logic: Host interface, GitHub client, PR-body parser, tree builder, VS Code message types |
| `apps/ui` | All browser-side code: UI, the three.js island view (3D and flat), hosts (web, local, extension), entries, the Vite build for all three targets |
| `apps/extension` | VS Code extension host (`darkpyonix.researchtree`) |
| `apps/proxy` | Cloudflare Worker → `https://researchtree.thisisthepy.workers.dev` |
| `apps/researchtree` | Python package: `github/` (api, auth, tokens), `experiment/` (body, tracking), `memory/` (the PR tree as typed objects for agents: build, model, source, rules, manifest, spec), `server/` (app, handler, static), `skills/researchtree/SKILL.md` (the agent skill, installed by `researchtree skill install` via `skill.py`), `cli.py`, `git.py` |
| `tests/<app>` | Tests for each app; `tests/fixtures` holds data shared by TS and Python |
| `scripts/` | Repository maintenance scripts (`merge-to-main.sh`) |

```bash
npm install                 # from the repo root
npm test                    # vitest (config: tests/vitest.config.ts)
npm run typecheck
npm run dev                 # web dev server on :5173
npm run build               # web + local + extension builds (all from apps/ui)
npm run package:extension   # .vsix
uv run pytest               # Python tests
uv build                    # Python wheel (run `npm run build:local` first, or the build hook does it)
npm run docs:build          # guide (builds the season gallery first)
scripts/merge-to-main.sh    # develop -> main, dropping develop-only docs (add --push to push)
```

Before finishing a change: run the tests and typecheck for every package you touched.

## Documentation layout

- `docs/` on `develop` holds internal design docs (DIRECTION, CONVENTIONS, FEATURE, IMPLEMENTATION, ROADMAP, references).
- **On `main`, the root keeps only `README.md` of its markdown files (no `CLAUDE.md`, `PROJECT.md`, ...), and `docs/` keeps only `docs/locale/` and `docs/guide/`; everything else is removed.** Merge `develop` into `main` with `scripts/merge-to-main.sh`, which does this. Therefore `README.md`, `docs/locale/*`, and `docs/guide/*` must never link to other `docs/` files; copy the needed content into the guide instead.
- `README.md` is the English front page; translations live in `docs/locale/README_<lang>.md` (e.g. `README_ko.md`) and link back to each other.
- `docs/guide/` is the user/developer guide published on GitHub Pages at `/researchtree/guide/` (the viewer itself is served at `/researchtree/`). Keep it in sync with actual features.

## Working rules

- Keep code consistent with its surroundings: naming, idioms, comment density. Prefer small, focused modules.
- When a design decision changes, update the relevant document in `docs/` in the same change.
- Never commit secrets (`.dev.vars`, tokens, client secrets).
- Ownership: DarkPyonix org owns GitHub Pages hosting, the OAuth App, the VS Code publisher and the PyPI package. The auth proxy runs on the thisisthepy Cloudflare account.

## Git

- Development happens on `develop`. Commit directly to the checked-out branch; do not create feature branches unless asked. Check `git branch --show-current` before committing.
- Commit only when asked.
- Message format: `Type: Summary` on a single line, e.g. `Feat: Add tree view`, `Docs: Add references`, `Chore: Add js ignores`.
  - Types: `Feat` (new feature), `Fix` (bug fix), `Refactor` (no behavior change), `Test`, `Docs`, `Chore` (tooling, config, dependencies).
  - Summary: English, imperative mood, first word capitalized, no trailing period.
  - Add a body only when the reason for the change is not obvious from the summary.
- One logical change per commit; do not mix unrelated changes.
- **No AI co-author.** Do not add `Co-Authored-By` trailers for Claude or any AI, and do not add "Generated with ..." lines to commits or pull requests. The human committer is the only author.
