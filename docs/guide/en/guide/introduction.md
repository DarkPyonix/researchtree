# Introduction

*Every branch is an experiment. Every PR is its lab note.*

ResearchTree turns Git branches and pull requests into a picture of your research: an experiment tree that grows out of your first implementation.

![3D research island](/images/readme/en/island.png)

## Why you need it

Research means changing your baseline code a little at a time, over and over. But the records of those experiments usually end up scattered across a W&B dashboard, a personal notebook, chat messages, and commit titles. A few months later it's hard to tell which idea came from where, what was adopted, and why something was rejected.

ResearchTree solves this with four simple rules.

| Rule | What it means |
|---|---|
| **One branch = one experiment** | A branch holds one small, clear code change that tests one hypothesis |
| **One PR = one lab note** | The PR body records the hypothesis, the change, the metrics, and the conclusion |
| **Branching = the tree** | If experiment B branches off experiment A, it becomes A's child in the tree too |
| **PR state = the conclusion** | Open means running, merged means adopted, closed means rejected |

The viewer gathers those PRs and draws them as a tree. Click a node and you see the hypothesis, the conclusion, the metrics, and the commits right away. All the data stays on GitHub — there's no separate database and no server-side cache.

```
research (v1)                  ← the root of the tree (first implementation)
├─ experiment/baseline-moshi
│  ├─ experiment/depth-lr-half      (rejected)
│  └─ experiment/depth-lr-warmup    (adopted → research v2)
│                                   └─ experiments branching off research v2 …
└─ experiment/...

main, develop, anything else    ← not for research. Not shown in the tree
```

## Open science

Every experiment record stays in the repo. Each time you try something, the code, the hypothesis, the metrics, and the reason it was adopted or rejected pile up as ordinary branches and PRs. Nothing gets buried in a private note or a separate database.

So just making the repo public shares not only your final result but the whole path you took to get there — including the failed experiments and the passing ideas that papers usually leave out. Anyone can check out a branch that interests them, reproduce the experiment, compare it with its parent, or pick up where it left off. ResearchTree shows the whole research process, which is what makes open science transparent and reproducible.

## A look around

| 3D research island (default) | Flat view |
|---|---|
| ![3D island](/images/readme/en/island.png) | ![Flat view](/images/readme/en/flat-tree.png) |

| Version panel | Sign-in screen |
|---|---|
| ![Version panel](/images/readme/en/version-panel.png) | ![Sign in](/images/readme/en/sign-in.png) |

## Three ways to use it

There are three ways to open the viewer, so pick the one that fits your setup. Whichever you choose, you only sign in to GitHub once at the start.

| Way | What it's good for | Guide |
|---|---|---|
| **Hosted web** | Nothing to install — share your screen with a single link | [Hosted web](/guide/web) |
| **VS Code extension** | Picks up the workspace repo, checks out branches, shows diffs | [VS Code extension](/guide/vscode) |
| **Running locally** | Self-host with `researchtree serve`, no central server | [Running locally](/guide/local) |

Inside a training script, the Python package lets you write metrics into the PR with a single line like `rt.log(val_loss=...)` ([Training script integration](/guide/tracking)).

## Where it stands today

::: warning Not there yet
- **Open VSX**: the VS Code extension is only on the VS Code Marketplace. An Open VSX listing is coming soon.
- Creating a new experiment, timeline playback, tour mode, search, and the minimap aren't supported yet. To start a new experiment, create the branch and PR on GitHub.
:::

## Next steps

1. [Set up your repo](/guide/repo-setup): create the `research` branch and the first version tag `v1`
2. [How to record research](/rules/branches): how to use branches and PRs
3. [Using the viewer](/viewer/island): how to explore the island and the tree
