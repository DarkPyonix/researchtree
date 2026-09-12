# Security and privacy

ResearchTree uses a GitHub token to read and write the PR data in your repo. To keep that token safe, each host it runs in limits where the token is stored and how far it can travel, as tightly as possible.

## What is stored and what isn't

- **GitHub is the only data store.** ResearchTree runs no database and no server-side cache of any kind. All of your experiment records live entirely in your repo (branches, PRs, tags).
- The only data the viewer keeps on your device is the token (web), recently viewed repos, the last repo, the view mode, the label metric per island, the language setting, and the branch settings per repo.
- If you [install the hosted web as an app](/guide/web), the service worker caches only the viewer's screen files (HTML, scripts, styles, fonts, icons). It only touches files from the same address, and never stores `api.github.com` requests or your token.

## The token boundary

The token never leaves the host boundary it belongs to. It's never sent to a webview, to a log, or to any domain other than `api.github.com`.

| Host | Where the token lives | Who calls GitHub |
|---|---|---|
| Hosted web | Browser `localStorage` | The browser |
| VS Code extension | The extension host (VS Code auth session) | The extension host. The webview only sends requests as messages |
| Running locally | The OS keychain, or a config file (0600) | The local Python server. The browser never has the token |

- Every GitHub API call is given only a path relative to `api.github.com`. Full-URL requests are rejected, so in no environment can the token leak to another domain.
- The default request permission is the `repo` scope. You need it to read and write private repos, but it's fairly broad — it grants write access to every private repo you can reach. If you'd rather keep permissions minimal, we recommend a **fine-grained PAT** scoped to just the target repo (Pull requests read/write, Contents read).

## Hosted web

- **CSP**: scripts are allowed only from our own origin (`'self'`), and network connections only to `api.github.com` and the auth proxy. Images are allowed from our own origin and GitHub avatars.
- Nothing is fetched from an external CDN at runtime. Even the fonts (Pretendard, Fraunces, JetBrains Mono) are all in the bundle.
- **Sanitizing PR bodies**: PR bodies are treated as untrusted external input. The rendered markdown is cleaned with DOMPurify so no script can run, and links in the body open in a new tab.
- **The OAuth flow**: signing in creates a random `state` that's checked against the callback value, and the `code` parameter is wiped from the address bar the moment auth finishes.

### The auth proxy

GitHub's token exchange endpoint doesn't support CORS, so a browser can't call it directly. A small Cloudflare Worker (`https://researchtree.thisisthepy.workers.dev`) relays it.

- The proxy does **one thing only: exchange an OAuth code for a token** (`POST /token`).
- It never stores or logs the token or the request body on the server.
- It only accepts requests from allowed origins (the official site, and `http://localhost:5173` for development).
- The client secret is kept solely as a Worker secret.

If you sign in with a PAT, nothing goes through the auth proxy at all — you talk straight to GitHub.

## VS Code extension

- The webview can read only the build files inside the extension folder, and a nonce-based CSP is applied.
- The webview doesn't know the token. GitHub requests go to the extension host as internal messages, and the extension host makes the call after the same path checks.

## Running locally

- It binds only to `127.0.0.1`.
- To block DNS rebinding attacks, every request — static files included — is rejected unless the `Host` header is `127.0.0.1:<port>` or `localhost:<port>`.
- Every run creates a new session token, injects it into the HTML it serves, and requires it on every `/api/*` request. A page on another site can't call your local API.
- The GitHub relay (`/api/github/*`) allows only GET, POST, PATCH and PUT, and blocks DELETE.

## Training scripts

`rt.log()` and friends use the locally saved token (or `RESEARCHTREE_TOKEN`) to safely edit nothing but the PR body of the current branch. When you use `RESEARCHTREE_TOKEN` on a shared server, take care that the token string doesn't end up in shell history or a shared script.

The formal documents are the [privacy policy](/legal/privacy) and the [terms of service](/legal/terms).
