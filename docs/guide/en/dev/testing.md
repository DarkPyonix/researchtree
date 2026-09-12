# Testing

TypeScript code is tested with vitest, Python code with pytest. Test files live under `tests/` in the same structure as `apps/`.

```bash
npm test              # vitest run --config tests/vitest.config.ts
npm run typecheck     # tsc: core, ui, proxy, extension, tests
uv run pytest         # tests/researchtree (same as npm run test:py)
```

## vitest (TypeScript)

| File | What it checks |
|---|---|
| `tests/core/prbody.test.ts` | lossless round-trips of the PR body. Edge cases such as a missing block, broken YAML and several blocks are checked against the shared fixture |
| `tests/core/tree.test.ts` | parent and status rules, orphan and cycle handling, hiding `main`/`develop` PRs, linking research versions, branch settings, time and season (`started`/`ended`) math |
| `tests/core/i18n.test.ts` | that the Korean and English string tables have matching keys, that no string is empty, placeholder filling, picking the UI language from the environment |
| `tests/core/github.test.ts` | API path checks (`assertApiPath`), Link-header pagination, 304 cached responses, error handling |
| `tests/extension/rpc.test.ts` | the extension host's webview message handling and method limits, and that no token shows up in a response or an error |
| `tests/proxy/proxy.test.ts` | blocking origins that aren't allowed, preflight requests, code exchange, and that error responses never leak the secret |

The config file is `tests/vitest.config.ts` (Node environment, `**/*.test.ts`), and type checking runs with `tests/tsconfig.json`.

## pytest (Python)

| File | What it checks |
|---|---|
| `tests/researchtree/experiment/test_body.py` | that `body.py` produces the same results as TS from the same fixture |
| `tests/researchtree/experiment/test_tracking.py` | `rt.log`/`set`/`conclude`, rank handling, whether a failure only leaves a warning, the prefix environment variable |
| `tests/researchtree/github/test_auth.py` | how Device Flow responses (`authorization_pending`, `slow_down`, `expired_token`) are handled |
| `tests/researchtree/github/test_tokens.py` | the token lookup order and how tokens are stored |
| `tests/researchtree/server/test_server.py` | the local server's Host header check, session token validation, and the limits on the relay endpoint |

Per the `pyproject.toml` settings, pytest runs with `--import-mode=importlib`. That keeps the `tests/researchtree/` path from shadowing the real package name `researchtree`. `conftest.py` sets things like `RESEARCHTREE_CLIENT_ID` up front for the tests.

## Shared fixtures

`tests/fixtures/` holds the data that TS and Python use together.

| File | Purpose |
|---|---|
| `prbody-cases.json` | PR-body parsing and rewriting cases. Both `prbody.test.ts` and `test_body.py` have to pass |
| `prs-sample.json` | the sample PR list used by the tree-rule tests |

When you change the PR-body rules, fix the **fixture first**, then update the TS and Python implementations.

## Tests we don't have yet

- Playwright E2E ("sign in → pick a repo → click a node") and an extension integration test based on `@vscode/test-electron`
- a CI smoke test along the lines of `uv tool install ./dist/*.whl && researchtree --version`
