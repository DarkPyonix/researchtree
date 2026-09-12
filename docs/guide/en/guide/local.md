# Running locally

`researchtree serve` is the self-hosted way to run: the viewer comes up right on your own machine (`127.0.0.1`). Nothing goes through the hosted site or the auth proxy — a local Python server makes the GitHub API calls for you. The built viewer ships inside the package, so it runs even without Node.js. You need Python 3.11 or newer.

## Install

```bash
uv tool install researchtree    # or pip install researchtree
uvx researchtree serve          # run once, without installing
```

For the latest development version from the repo, use `uv tool install git+https://github.com/DarkPyonix/researchtree`. Installing straight from Git makes the wheel build hook build the viewer too, which needs Node.js and npm; if they aren't there, it installs without the viewer. Even then, things like `rt.log()` for training scripts still work fine — you'll only see a note about building the viewer when you run `researchtree serve`. If you'd like your token kept safely in the OS keychain, install the optional `keyring` extra as well (`pip install "researchtree[keyring]"`).

## Commands

| Command | What it does |
|---|---|
| `researchtree serve [--repo owner/name] [--port N] [--no-browser]` | Starts the local server and opens your browser. If the current directory is a GitHub repo, it opens that repo by default. The default port is `7337`; if it's taken, it finds a free one automatically (unless you set `--port` yourself, in which case it fails) |
| `researchtree login` | Signs in from the terminal with the GitHub Device Flow. Handy on a GPU server where you can't open a browser |
| `researchtree logout` | Deletes the saved token. The `RESEARCHTREE_TOKEN` environment variable is left alone |
| `researchtree open [--repo owner/name]` | Opens this repo's tree in the [hosted web](/guide/web) viewer |
| `researchtree --version` | Prints the version |

You can also run it as a module: `python -m researchtree serve`.

```bash
cd ~/work/moshi-research
researchtree serve
# ResearchTree: http://127.0.0.1:7337/?repo=lab/moshi-research
# Default repo: lab/moshi-research
# Press Ctrl+C to stop.
```

## Signing in

The first time you open the local page, click "Sign in with GitHub" and you'll get a Device Flow code. Enter it at `github.com/login/device`, approve it, and the tree appears on its own. From the terminal, `researchtree login` does the same thing.

::: tip Other ways to sign in
- On a server with no browser, put a [personal access token](/guide/web) in the `RESEARCHTREE_TOKEN` environment variable and run it.
  ```bash
  export RESEARCHTREE_TOKEN=github_pat_...
  researchtree serve
  ```
- To use your own OAuth App (with Device Flow enabled), put its client ID in `RESEARCHTREE_CLIENT_ID`.
:::

## Where the token is kept

The token is looked for in this order. When you sign in, it goes to the keyring first, and to a file if the keyring isn't available.

1. The `RESEARCHTREE_TOKEN` environment variable
2. The OS keychain (with `keyring` installed, service name `researchtree`)
3. A config file (mode 0600)

| OS | File path |
|---|---|
| Windows | `%APPDATA%\researchtree\token` |
| macOS | `~/Library/Application Support/researchtree/token` |
| Linux | `$XDG_CONFIG_HOME/researchtree/token` (default `~/.config/researchtree/token`) |

The saved token is also what `rt.log()` uses in [training script integration](/guide/tracking).

## Security of the local server

- It binds only to `127.0.0.1`, so other machines on your network can't reach it.
- To prevent DNS rebinding, requests are rejected unless the `Host` header is `127.0.0.1:<port>` or `localhost:<port>`.
- Every run creates a new session token, puts it in the page, and checks it on every `/api/*` request.
- The GitHub relay allows only GET, POST, PATCH and PUT, and the token is never exposed to the browser.

For more, see [Security and privacy](/guide/security).
