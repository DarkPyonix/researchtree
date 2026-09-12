# Privacy Policy

**Effective date: September 11, 2026**

ResearchTree is an open-source tool published by DarkPyonix that shows the experiment branches and PRs of a GitHub repo as a tree. This policy applies to every form in which ResearchTree is offered: the central web viewer (`https://darkpyonix.dev/researchtree/`), the VS Code extension, the Python package (`researchtree`, including the local server), and the authentication proxy (`https://researchtree.thisisthepy.workers.dev`).

## Summary

- ResearchTree has **no database and no server of its own** that stores your data. Your research records stay in your GitHub repo.
- Your GitHub token stays only on your device, and is sent only to `api.github.com`.
- We collect **no analytics, no telemetry, no tracking cookies, and no advertising data.** We do not sell or share personal data.

## Data we handle

| Data | Where it goes | Why |
|---|---|---|
| GitHub access token | Stored only on your device: browser `localStorage` (web), VS Code's GitHub authentication session (extension), OS keychain or a `0600` config file (Python package) | To call the GitHub API on your behalf |
| Repo data (PRs, branches, tags, commits, comments, changed files) | Read directly from `api.github.com` into the viewer on your device | To show the tree and the experiment details |
| Your edits and comments | Written to GitHub only when you save an edit, post a comment, or run a command such as `rt.log()` or `researchtree release` | To record your experiments where you asked |
| Viewer settings: recent and last repo, view mode, label metric per version, language, branch settings per repo, panel width, card collapse state | Your device's browser `localStorage` or VS Code's extension storage | To remember your settings |
| OAuth authorization code (web sign-in only) | Sent once to the authentication proxy, which exchanges it with GitHub for a token and returns it to your browser | Because GitHub's token endpoint cannot be called directly from a browser |

We do not receive, copy, or store this data on servers we operate. You can erase everything left on your device by signing out (which deletes the token) and clearing the site data, or with `researchtree logout` for the Python package.

## Authentication proxy

The proxy is a Cloudflare Worker that does one thing only: exchange an OAuth authorization code for a token (`POST /token`). It does not store or log codes, tokens, or request bodies, and it only accepts requests that come from the official site. The OAuth client secret is kept only as a Worker secret. If you sign in with a personal access token (PAT), the proxy is not used at all.

## Third-party services

- **GitHub** (API, OAuth, and the GitHub Pages that host the web viewer and this guide). When you use the central web, GitHub receives your `api.github.com` requests and serves the pages, and may log technical information such as IP addresses. See the [GitHub Privacy Statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
- **Cloudflare** (runs the authentication proxy). It processes the network traffic of the token exchange. See the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/).
- **External links such as W&B** that you put in a PR body are only opened when you click them.

Apart from GitHub avatars, the viewer loads no scripts, fonts, or images from other domains.

## Permissions

Signing in with GitHub requests the `repo` scope. It is needed to read and write PRs in private repos. If you want narrower permissions, use a fine-grained personal access token that grants **Pull requests (read/write)** and **Contents (read)** only on the repos you choose.

## Children

ResearchTree is a developer tool and is not directed at children under 13 (or the minimum age in your country).

## Changes

We may revise this policy when ResearchTree changes. The effective date above shows the latest version, and the full history is public in the [repo](https://github.com/DarkPyonix/researchtree/commits/main/docs/guide/legal/privacy.md).

## Contact

For questions or requests, please open an issue at [github.com/DarkPyonix/researchtree/issues](https://github.com/DarkPyonix/researchtree/issues). For security problems, please let us know through a [private security advisory](https://github.com/DarkPyonix/researchtree/security/advisories/new).
