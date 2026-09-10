# ResearchTree for VS Code

*Every branch is an experiment. Every PR is its lab note.*

ResearchTree draws your research as a tree: each `experiment/*` branch is a node, and its pull request holds the hypothesis, change, metrics, and conclusion. This extension opens the tree right next to your code.

## Features

- **ResearchTree: Open Tree** from the Command Palette (or the status bar button) opens the tree in an editor tab.
- The repository is picked automatically from the workspace `origin` remote. In multi-root workspaces you choose which one to show.
- Sign in with the GitHub account built into VS Code. The token stays in the extension host and is never handed to the webview.
- **Checkout**: switch to a node's `experiment/*` branch locally (creates a tracking branch if it only exists on the remote).
- **Diff against parent**: pick a changed file and open it in the VS Code diff editor.
- External links (PRs, W&B) open in your browser.

## Requirements

- A workspace whose `origin` remote points to GitHub.
- Branch and PR conventions: see [CONVENTIONS](https://github.com/DarkPyonix/researchtree/blob/main/docs/CONVENTIONS.md).

## Commands

| Command | Description |
|---|---|
| `ResearchTree: Open Tree` | Open the tree panel |
| `ResearchTree: Sign Out` | Stop using the GitHub session in ResearchTree |

## License

Apache-2.0
