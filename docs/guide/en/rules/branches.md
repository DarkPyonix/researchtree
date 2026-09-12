# Branches

These are the branch rules your team follows when using ResearchTree.

::: tip You can rename them
The root branch (`research`) and the experiment branch prefix (`experiment/`) are just defaults. You can change them per repo in the viewer's [branch settings](/viewer/navigation), and `rt.log()` in your training script can match the prefix through the `RESEARCHTREE_PREFIX` environment variable. Wherever the docs say `research` and `experiment/`, read them as whatever names you picked.
:::

## What each branch is for

| Branch | Purpose | Shown in the tree |
|---|---|---|
| `research` | The root of the research tree. It holds the initial implementation that experiments start from, and it's where adopted experiments come together | O (root) |
| `experiment/*` | One branch per experiment | O (node) |
| `main`, `develop` | Used for non-research work like releases and regular development | X |
| Every other branch | Ordinary branches unrelated to research | X |

- The viewer only draws `research` and `experiment/*` in the tree. Other branches and their PRs never show up. A `develop` → `main` or `experiment/*` → `main` PR, for example, isn't shown in the tree.
- How you move code back and forth between `research` and `main`/`develop` is up to you. It has no effect on the tree at all.

## Experiment branches

- Name them `experiment/<short-name>`, like `experiment/depth-lr-half`.
- Keep a single level under `experiment/` — no subfolders. Instead of putting a hierarchy in the branch name, express it through the parent relationship.
- Test one hypothesis per branch. Two hypotheses means two branches.
- An experiment that starts from research branches off the research version tag (`vN`) it's based on ([research version tags](/rules/versions)).
  ```bash
  git switch -c experiment/warmup-cosine research/v2
  ```
- A derived experiment that picks up from another one branches straight off the parent experiment branch.
  ```bash
  git switch experiment/baseline-moshi
  git switch -c experiment/depth-lr-half
  ```
- Commit as freely as you like. The experiment record lives in the PR body.

## Branches get cleaned up when you cut a version

- Don't delete finished experiment branches by hand. Clean them up all at once with [`researchtree release`](/rules/versions) when you cut a new version. Branches that were never merged get their commits reverted and merged into `research` so the record stays, and then they're deleted.
- Turn off the **"Automatically delete head branches"** option in your repo settings. If a parent branch that still has running children gets deleted, the base branch of the child PRs changes out from under you.

## Rules for branch settings

There are a few rules for branch setting values.

- Only letters, digits, `.`, `_`, `-`, and `/` are allowed. They can't start with `/`, and they can't contain `//` or `..`.
- The root branch name can't end with `/`.
- The prefix always ends with `/`. If you leave off the trailing slash, it gets added for you.
- The root branch name can't start with the experiment prefix. For example, a prefix of `exp/` with a root of `exp/main` isn't allowed.
