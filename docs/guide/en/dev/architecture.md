# Architecture

One viewer, written in TypeScript, runs on three hosts: the central web app, the VS Code extension, and the local server. The viewer never calls GitHub directly; authentication and API requests all go through the `Host` interface. The tree logic, the PR-body parsing and the UI work on their own, independent of the host environment.

```
                     ┌─────────────── viewer (TS SPA) ───────────────┐
                     │  UI (three.js) ── core (tree, prbody)         │
                     │                 │                             │
                     │           Host interface                      │
                     └───────┬─────────────┬─────────────┬───────────┘
                             │             │             │
                  ┌──────────▼───┐  ┌──────▼───────┐  ┌──▼──────────────────┐
                  │ web host     │  │ extension    │  │ local host          │
                  │ (browser)    │  │ (webview)    │  │ (browser)           │
                  └──┬────────┬──┘  └──────┬───────┘  └──┬──────────────────┘
                     │        │      postMessage          │ fetch /api/*
   OAuth code→token  │        │            │              │
   ┌─────────────────▼──┐     │   ┌────────▼─────────┐  ┌─▼──────────────────┐
   │ proxy              │     │   │ extension host   │  │ Python local server │
   │ (Cloudflare Worker)│     │   │ (Node)           │  │ (researchtree serve)│
   └────────────────────┘     │   │ GitHub auth      │  │ Device Flow, keyring│
                              │   └────────┬─────────┘  └─┬──────────────────┘
                              ▼            ▼              ▼
                                   api.github.com
```

| Host | Where the token lives | Who calls GitHub | First repo opened |
|---|---|---|---|
| web | the browser's `localStorage` | the browser (CORS allowed) | URL `?user=` / `?repo=`, the last repo, or the picker screen |
| extension | the extension host (VS Code auth session) | the extension host | the workspace git remote |
| local | OS keychain / config file (Python) | the local Python server | the git remote of the working directory, or `--repo` |

## The Host interface

[`apps/core/src/host.ts`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core/src/host.ts)

```ts
export interface Host {
  kind: "web" | "extension" | "local";
  auth: {
    current(): Promise<GitHubUser | null>;
    signIn(ui: SignInUI): Promise<GitHubUser>; // web: OAuth redirect, extension: getSession, local: Device Flow
    signOut(): Promise<void>;
    availability(): { ok: true } | { ok: false; reason: string };
  };
  request(req: GitHubRequest): Promise<GitHubResponse>; // method, path, query, body, etag
  initialRepo(): Promise<string | null>;
  openExternal(url: string): void;
  storage: { get<T>(key: string): T | undefined; set(key: string, value: unknown): void };
  capabilities: {
    checkout?(branch: string): Promise<void>;           // extension only
    openDiff?(base: string, head: string): Promise<void>; // extension only
    signInWithToken?(token: string): Promise<GitHubUser>; // web only (PAT)
  };
}
```

- `request` only takes paths on `api.github.com`. Before a host sends a request, `assertApiPath` checks for and rejects full URLs, `//`, schemes and backslashes, so no host can leak the token to another domain. The only methods you can use are GET, POST, PATCH and PUT.
- The viewer only shows buttons for the features declared in `capabilities`.

## The three build modes

The viewer is built three times from the single `apps/ui`, changing only the Vite mode. Each bundle contains only the host code its entry point needs.

| Command | Vite mode | Entry | Output | CSP `connect-src` |
|---|---|---|---|---|
| `npm run build:web` | default (web) | `main.web.ts` | `apps/ui/dist/` (GitHub Pages) | `'self'`, `api.github.com`, the auth proxy |
| `npm run build:local` | `serve` | `main.local.ts` | `apps/researchtree/server/static/` | `'self'` (the local server relays everything) |
| `npm run build:extension` | `extension` | `main.extension.ts` | `apps/extension/media/main.js`, `main.css` | the extension sets its own nonce-based CSP |

The web build reads these environment variables (from an `apps/ui/.env*` file or your shell).

| Variable | What it means |
|---|---|
| `VITE_GITHUB_CLIENT_ID` | the OAuth App client ID (a public value). Leave it unset and "Sign in with GitHub" is disabled, leaving only PAT sign-in |
| `VITE_AUTH_PROXY_URL` | the auth proxy address. Defaults to `https://researchtree.thisisthepy.workers.dev` |
| `VITE_OAUTH_PKCE` | set it to `"true"` to also use PKCE (`code_verifier`) |

## Data flow

1. **Boot**: the host's `auth.current()` tells us who is signed in. If nobody is, we show the sign-in screen; if somebody is, we pick what to open in the order `?user=`/`?repo=` → `initialRepo()` → the last repo.
2. **Loading**: `GitHubClient` checks that the root branch exists, then fetches the PR list (`/pulls?state=all`, paginated) and the version tags (`/tags` plus the tag commit dates) in parallel. Responses are cached with conditional ETag requests.
3. **Building the tree**: `buildTree(prs, repo, config, tags, activity)` filters what to show, decides status and parent, links versions, handles orphan and cyclic nodes, and computes generations ([tree rules](/rules/tree-rules)).
4. **Layout**: `placeTree` in `views/layout.ts` places rows with a `d3-hierarchy` tidy tree and picks columns by date. A node can get pushed to the right of its date to make room, so the year and season ticks are drawn with a monotonic transform fitted to where the nodes actually ended up, which keeps node dates and positions aligned. We leave generous gaps between sibling nodes that land on different islands, and in front of a new version.
5. **Rendering**: `Tree3D` draws the screen (three.js, an orthographic camera, instanced voxel tiles, random numbers seeded with the repo name). Every research version gets an island; the path leaving an island ends at a wooden pier on stilts, and ferries flying branch-colored flags float on the sea between islands. The flat view is the same scene with the camera turned overhead and the plants pressed down, hiding the ground, water, piers, ferries and decorations (it supports panning and zooming only, no rotation). The stretches that cross the sea are joined by dotted path tiles that only appear in the flat view. Labels are HTML chips projected from 3D coordinates onto the screen.
6. **Panel**: PR-body markdown is rendered safely, only through `renderMarkdown` (marked + DOMPurify), and the DOM is built directly with the `h()` helper. We never drop an external string straight into `innerHTML`.
7. **State sync**: the selected node and repo are kept in sync with the URL query in real time (except in the extension). Settings such as the language and per-repo branch names, the view mode, and the per-island label metric are saved in `host.storage` so they stick.

## Lossless PR-body rewriting

[`apps/core/src/prbody.ts`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core/src/prbody.ts) and [`apps/researchtree/experiment/body.py`](https://github.com/DarkPyonix/researchtree/tree/main/apps/researchtree/experiment/body.py) follow the same rules.

- They find and parse the first ` ```yaml ` fenced block in the body, and leave the text before and after it untouched.
- When the content changes, only that block is replaced. If there is no block, a new one is added at the top of the body.
- Comments, key order and even unknown fields are preserved. TS uses the `yaml` (eemeli/yaml) Document API and Python uses `ruamel.yaml`.
- A block that fails to parse is never overwritten.
- Both implementations have to pass the `tests/fixtures/prbody-cases.json` tests. When you change the rules, fix the fixture first and then update both implementations.

## Notes per host

- **web**: the OAuth web flow (`state` verification, removing `code` right after the callback) → the proxy's `POST /token` → saving to `localStorage`. PAT sign-in is validated with `/user` and then saved. On a 401 we clear the token and go back to the sign-in screen.
- **extension**: uses `vscode.authentication.getSession("github", ["repo"])`. When the webview sends `postMessage({ id, type: "github", req })`, the extension host calls out with Node `fetch` and answers with `{ id, res }`. `retainContextWhenHidden` is on, so state survives hiding the tab.
- **local**: uses the standard library's `http.server`. The endpoints are `/api/context`, `/api/auth`, `/api/auth/device`, `/api/auth/device/poll`, `/api/auth/logout` and `/api/github/{path}` (the relay). Device Flow automatically stretches its polling interval when it gets a `slow_down` response.
