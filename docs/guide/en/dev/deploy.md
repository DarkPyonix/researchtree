# Deployment

| Target | How | Owner |
|---|---|---|
| the central web app + this guide | GitHub Actions `pages.yml` → GitHub Pages | DarkPyonix/researchtree |
| the auth proxy | `wrangler deploy` from `apps/proxy` (only when it changes) | the thisisthepy Cloudflare account |
| the VS Code extension | a `v*` tag → GitHub Actions `release.yml` (`vsce publish`, `ovsx publish`) | Marketplace publisher `darkpyonix`, Open VSX |
| the Python package | a `v*` tag → GitHub Actions `release.yml` (`uv build`, `uv publish`) | PyPI `researchtree` |
| the OAuth App | registered in the GitHub organization settings (one for production, one for development) | the DarkPyonix organization |

## Releases (PyPI, VS Code Marketplace, Open VSX)

Bump `version` in `pyproject.toml` and `version` in `apps/extension/package.json` to the same value, merge into `main`, then push a tag for that version.

```bash
git switch main && git pull
git tag -a v1.0.0 -m "v1.0.0" && git push origin v1.0.0
```

`.github/workflows/release.yml` checks that the tag and the two versions match, then releases the Python package and the VS Code extension at the same time. Research version tags are prefixed with the root branch name, like `research/v1`, so they never clash with these tags.

**One-time setup**

- **PyPI**: on [pypi.org](https://pypi.org/manage/account/publishing/), go to **Publishing → Add a new pending publisher**, choose GitHub, and register PyPI project `researchtree`, owner `DarkPyonix`, repository `researchtree`, workflow `release.yml`, environment `pypi`. It's Trusted Publishing, so no API token is stored.
- **VS Code Marketplace**: create the publisher `darkpyonix` on the [publisher management page](https://marketplace.visualstudio.com/manage), then issue a Personal Access Token in Azure DevOps with the **Marketplace (Manage)** permission and the **All accessible organizations** scope.
  If you can't use Azure DevOps, leave the token unset and upload the file yourself on the same management page under **New extension → Visual Studio Code** — either the `vsix` artifact the workflow leaves behind or the one `npm run package:extension` builds. The workflow skips any store with no token.
- **Open VSX**: sign in to [open-vsx.org](https://open-vsx.org) with GitHub, link your Eclipse account, sign the **Publisher Agreement**, then create an access token and create the namespace once (`npx ovsx create-namespace darkpyonix -p <token>`).
- Create the `pypi` and `marketplace` environments under the repo's **Settings → Environments**, and put the secrets `VSCE_PAT` (the Marketplace token) and `OVSX_PAT` (the Open VSX token) in `marketplace`.

## GitHub Pages

The `.github/workflows/pages.yml` workflow runs on a push to `main` or when you start it by hand (`workflow_dispatch`), and it does this:

1. `npm ci`
2. Build the viewer: it runs `npm run build:web` to build into `apps/ui/dist/`. If the repo variable `GITHUB_CLIENT_ID` (or `RESEARCHTREE_CLIENT_ID` when that one is missing) is set, it's passed through as `VITE_GITHUB_CLIENT_ID`.
3. Build the guide: `npm run docs:build` builds the docs into `docs/guide/.vitepress/dist/`.
4. Assemble `_site/`: the viewer output goes at the root and the guide goes in `_site/guide/`.
5. Deploy with `actions/upload-pages-artifact` and `actions/deploy-pages`.

| Address | What |
|---|---|
| `https://darkpyonix.dev/researchtree/` | the viewer |
| `https://darkpyonix.dev/researchtree/guide/` | this guide (VitePress `base: "/researchtree/guide/"`) |

**One-time setup**

- Set the repo's **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
- After registering the OAuth App, add its client ID (a public value) as `RESEARCHTREE_CLIENT_ID` under **Settings → Secrets and variables → Actions → Variables**. GitHub won't accept new variable names that start with `GITHUB_`, which is why we use this name. If you leave it unset, the deployed viewer only supports PAT sign-in.
- The OAuth App callback URL is `https://darkpyonix.dev/researchtree/`. Since there is exactly one callback URL, we don't keep preview deployments. Local development runs on `localhost:5173` with a development OAuth App.

## The auth proxy (Cloudflare Worker)

```bash
cd apps/proxy
npx wrangler secret put GITHUB_CLIENT_SECRET   # once, the first time
npm run deploy                                 # = npx wrangler deploy
```

- Set `GITHUB_CLIENT_ID` (a public value) and `ALLOWED_ORIGINS` (`https://darkpyonix.github.io,http://localhost:5173`) in the `vars` of `wrangler.jsonc`.
- The secret used for local development (`npm run dev` = `wrangler dev`) goes in `.dev.vars`. Never commit it to git.
- Deployed at: `https://researchtree.thisisthepy.workers.dev`

## The VS Code extension

```bash
npm run package:extension           # apps/extension/researchtree-<version>.vsix
```

For the release, the workflow uploads this `.vsix` to the VS Code Marketplace (publisher `darkpyonix`) and Open VSX.

The `vscode:prepublish` script copies the root `LICENSE` and builds the webview and the extension host together. The minimum supported VS Code version is `engines.vscode` (`^1.90.0`).

## The Python package

```bash
npm run build:local     # build the viewer into apps/researchtree/server/static/
uv build                # sdist and wheel in dist/
```

For the release, the workflow uploads it with PyPI Trusted Publishing.

- Keep it a platform-independent pure Python wheel (`py3-none-any`). `[project.scripts] researchtree = "researchtree.cli:main"` is declared, so `uv tool install` installs it ready to run.
- The source location is set by the hatch setting `packages = ["apps/researchtree"]`. The `static/` folder is gitignored, but it ships inside the wheel and the sdist as a build artifact.
- The `build.py` hook builds the viewer with npm on its own when `static/index.html` is missing. Set the environment variable `RESEARCHTREE_SKIP_WEBVIEW=1` to skip that build step.
