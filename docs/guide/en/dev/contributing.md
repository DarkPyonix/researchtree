# Contributing

## Development environment

- Node 20 or newer, npm (workspaces)
- Python 3.11 or newer, [uv](https://docs.astral.sh/uv/)

```bash
git clone https://github.com/DarkPyonix/researchtree
cd researchtree
npm install
npm run dev        # http://localhost:5173 (web host)
```

To use OAuth sign-in on the dev server, put a development OAuth App's client ID in `apps/ui/.env.local` (callback URL: `http://localhost:5173/`). If you skip it, just develop with PAT sign-in.

```ini
VITE_GITHUB_CLIENT_ID=Iv1.xxxxxxxx
```

The local server and the extension each need a build before you can try them.

```bash
npm run build:local && uv run researchtree serve
npm run build:extension && code --extensionDevelopmentPath="$PWD/apps/extension"
```

## Language

- **Code comments and docstrings**: English only.
- User-facing text (UI, CLI output, error messages): goes in both languages. The viewer and the VS Code extension keep theirs in `apps/core/src/i18n`, the Python package in `apps/researchtree/i18n`, with `ko` and `en` side by side.
- This guide: Korean is the source, and the English version of a page sits at the same path under `docs/guide/en/`. Comments inside code examples are in English.
- Commit messages: written in English.

## Code rules

- Anything that differs by host environment goes through the `Host` interface. The tree logic, the PR-body parsing and the UI must not depend on a particular host.
- PR-body rewriting has to be lossless. Only the YAML block changes; existing comments, key order and undefined fields are preserved, and a broken YAML block is never overwritten.
- TS (`prbody.ts`) and Python (`body.py`) follow the same rules. When you change the rules, fix the fixture first and then update both implementations together.
- Every GitHub call goes through `assertApiPath`, so the auth token never leaks outside its host boundary.
- Render PR bodies only through `renderMarkdown` (DOMPurify), and build DOM elements with the `h()` helper. Never drop an external string straight into `innerHTML`.
- Don't load runtime scripts from a CDN. Bundle every dependency into the build, and keep the CSP settings in `apps/ui/vite.config.ts` strict.
- The branch and PR conventions ([research record rules](/rules/branches)) are a promise the code has to keep. When you change a rule, change this guide first.
- Match the naming, idioms and comment density of the surrounding code, and prefer small, clear modules.
- Never commit sensitive secrets such as `.dev.vars`, tokens or client secrets.

## Commit rules

- Regular development happens on the `develop` branch. Don't create a separate feature branch unless you're asked to.
- Format: a single line, `Type: Summary`.

| Type | Used for |
|---|---|
| `Feat` | a new feature |
| `Fix` | a bug fix |
| `Refactor` | a structural change with no behavior change |
| `Test` | tests |
| `Docs` | documentation |
| `Chore` | tooling, config, dependencies |

```
Feat: Add tree view
Docs: Add references
Chore: Add js ignores
```

- Write the summary in the English imperative, capitalize the first letter, and leave off the period.
- Add a body only when the title alone can't explain why the change was made.
- Keep one logical change per commit, and don't mix in unrelated changes.
- **No AI co-authors**: don't put `Co-Authored-By` trailers for Claude or any other AI tool, or "Generated with …" lines, in commits and PRs. The human committer is the only author.

## Documentation rules

- `README.md` is the English front page, and translations go in `docs/locale/README_<lang>.md` (for example `README_ko.md`). The two link to each other.
- The `docs/` directory on the `main` branch keeps only `docs/locale/` and `docs/guide/`. So `README.md`, `docs/locale/*` and `docs/guide/*` must never link to another `docs/` path. Copy what you need into this guide instead.
- Keep this guide in sync with what's actually implemented. When a feature changes, update the guide in the same change. Don't document features that don't exist yet, and mark features still in progress with a `::: warning` container.
- You can preview the guide locally with `npm run docs:dev`. Careful: the build (`npm run docs:build`) fails if there is even one broken link.
