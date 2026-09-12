# VS Code extension

See your experiment tree right next to your code, and switch branches quickly. The extension ID is `darkpyonix.researchtree`.

## Installing

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=darkpyonix.researchtree), or search for `ResearchTree` in the Extensions tab. From a terminal, install it like this.

```bash
code --install-extension darkpyonix.researchtree
```

::: info Open VSX
A listing for editors that use Open VSX, like VSCodium and Cursor, is coming soon. Until then, build the `.vsix` from source and install that.

```bash
git clone https://github.com/DarkPyonix/researchtree && cd researchtree
npm install
npm run package:extension          # creates apps/extension/researchtree-<version>.vsix
code --install-extension apps/extension/researchtree-*.vsix
```
:::

## Requirements

- VS Code 1.90 or newer
- The built-in Git extension (`vscode.git`)
- A workspace whose `origin` remote points at GitHub

## Opening it

- Run **`ResearchTree: Open Tree`** from the command palette.
- Or press the **ResearchTree** button on the left of the status bar. That button only appears when the workspace has a GitHub repo.

The tree opens as an editor tab. Hide the tab and reopen it later and everything is right where you left it.

The interface language follows VS Code's display language (Korean if it's Korean, English otherwise). You can change it any time in the tree's [settings](/viewer/navigation).

## Picking the repo automatically

The repo (`owner/name`) is detected from the workspace's Git `origin` remote. If there are several candidates — a multi-root workspace, say — a QuickPick lets you choose which one to open.

## Signing in

It uses the GitHub account built into VS Code (requested scope: `repo`). Press "Allow" once in the dialog that appears the first time and you're done. The token is kept in the extension host only and is never passed to the webview.

Running **`ResearchTree: Sign Out`** makes ResearchTree stop using that GitHub session and returns you to the sign-in screen. Your VS Code GitHub sign-in itself stays as it is.

## Extension-only features

The detail panel of an experiment node gets two extra buttons.

| Button | What it does |
|---|---|
| **Checkout** | Fetches from `origin` and switches to that experiment branch. If the branch exists only on the remote, it creates a tracking branch and switches to it |
| **Diff against parent** | Shows the files changed between the parent experiment and this one (a GitHub compare) in a QuickPick, and opens the file you pick in the VS Code diff editor. If it can't find the remote branch locally, it opens the GitHub compare page instead |

External links such as the GitHub PR or W&B open in your default web browser.

## Commands

| Command | What it does |
|---|---|
| `ResearchTree: Open Tree` | Open the tree panel |
| `ResearchTree: Sign Out` | Stop using the GitHub session in ResearchTree |

::: tip
The tree and the panels work the same way on the hosted web, in the VS Code extension, and when running locally. The extension has no browser address bar, though, so [shareable links](/guide/web) aren't supported there.
:::
