# Navigation and tools

## What's on screen

| Where | What |
|---|---|
| Top left | **The repo info card**: repo name, number of experiments, number of versions and the deepest generation, status layers. Just below the card, the year (large) and season (small) at the center of the screen |
| Top right | **The toolbar**: refresh, switch view, settings, fit all, account menu |
| Right | The detail panel / version panel |
| Bottom center | The **generation** bar |
| Bottom left | Control hints |

## The toolbar

| Button | What it does |
|---|---|
| **Refresh** | Reads the PRs and tags from GitHub again and refreshes the tree. Your selected node is kept |
| **Flat view → Tree view → 3D view → Island view** | Each press moves to the next view: flat, flat turned so versions grow from bottom to top, the same direction in 3D, and back to the first screen ([The flat view](/viewer/flat)) |
| **Settings** | Opens the [language and branch settings](#settings) window |
| **Fit all** | Frames the whole tree so it fits on screen |
| **@account** | The account menu. Hover to open it (on a touch screen, tap to open and close); it sits above the detail panel. Items: open this repo on GitHub, open another repo, [User guide](https://darkpyonix.github.io/researchtree/guide/), [ResearchTree repository](https://github.com/DarkPyonix/researchtree), sign out |

## Status layers

The **Running / Adopted / Rejected** chips on the repo info card let you pick which experiments to look at. The number next to a chip is how many experiments have that status. Turn a chip off and those experiments fade out (translucent in 3D); turn it back on and they return.

## Label metric

The label metric is chosen **per island (per research version)**, because the number you care about tends to change from version to version. The metric you pick shows in small text under that island's node labels.

1. Click the island's version monument. For the first island (`v1`), click the old `research` tree. The [version panel](/viewer/panels) opens.
2. Pick the metric key you want from the panel's **Label metric** list.

- The list holds the `metrics` keys recorded by that island's experiments, most used first.
- The most-used key is selected by default. Pick **None** to turn it off.
- Your choice is saved per repo, so it's still there next time.

## Moving by generation

The **generation** bar at the bottom center moves you by depth from the root. Press `01`, `02` … to frame that generation's nodes, and `‹` `›` to step to the previous or next one. Press **Fit all** and the generation selection is released.

- The bar is about a third of the screen wide. Generations that don't fit can be scrolled sideways with the mouse wheel or with `‹` `›`, and both edges fade out softly.
- The selected generation moves to the middle of the bar.
- The counter on the right shows the selected generation and the total, like `12 / 18`. With nothing selected it reads `All 18`.

## Keyboard

| Key | What it does |
|---|---|
| `→` | Go to the first child (or to the root's first child if nothing is selected) |
| `←` | Go to the parent |
| `↑` / `↓` | Go to the previous / next sibling |
| `Esc` | Deselect, close the panel |

None of this fires while the cursor is in a text field or while you hold Ctrl/Alt/Cmd. When you move with the arrow keys, the camera follows the node smoothly.

## Settings

**Settings** in the toolbar is where you change the interface language and this repo's branch names. **Save and reload** saves both and reads the tree again.

### Language

The viewer and the VS Code extension speak Korean and English.

| Choice | What it does |
|---|---|
| **Auto** (default) | Follows the browser language. In the VS Code extension it follows VS Code's display language: Korean if that's Korean, English otherwise |
| **한국어** / **English** | Always shows the language you picked |

- The language setting is shared across every repo.
- The GitHub API doesn't tell us your language, and working the region out from your IP would mean going through an outside service. So we use the language set in your browser (or VS Code) as the default.
- The `researchtree` CLI follows your system language (Korean or English). You can set it with `RESEARCHTREE_LANG=en` or `ko`.

### Branch settings

Under **Branch settings** in the settings window (or the **Branch settings** button on the "No research branch" screen) you can change this repo's branch names.

| Item | Default | What it is |
|---|---|---|
| Root branch | `research` | The branch used as the root of the research tree |
| Experiment branch prefix | `experiment/` | Only PRs whose head branch starts with this prefix become nodes |

- While you type a branch name, an example (`research ← experiment/my-idea (PR base: research, tags: research/v1, research/v2 …)`) previews below.
- **Save and reload** saves the settings and reads the tree again. To put the branch names back, press **Defaults**.
- Settings are saved **per repo**. Web and local runs save them in that browser, VS Code in the extension's state, so everyone on the team sets their own.
- For the detailed input rules, see [Branch setting rules](/rules/branches).

::: tip Match your training script
If you changed the prefix, set the `RESEARCHTREE_PREFIX` environment variable to the same value in your training environment so `rt.log()` recognizes the current branch as an experiment ([Training script integration](/guide/tracking)).
:::
