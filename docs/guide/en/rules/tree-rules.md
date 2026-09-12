# Tree rules

This is how the viewer builds the tree out of your PR list and version tags. If an experiment node shows up somewhere you didn't expect, walk through the decision order below. The actual implementation lives in [`apps/core/src/tree.ts`](https://github.com/DarkPyonix/researchtree/tree/main/apps/core/src/tree.ts).

## What gets shown

- Only PRs whose head branch is `experiment/*` become tree nodes. The node ID is the head branch name.
- Even with an `experiment/*` head, a PR based on a non-research branch like `main` or `develop` is treated as ordinary work and hidden — unless the YAML has a `parent`, in which case it's shown in the tree.
- If one experiment branch has several PRs, the most recently opened one among those based on `research` or `experiment/*`, or carrying a `parent`, is used.
- `main`, `develop`, and every other branch never enter the tree model at all.

## How the status is decided

1. If the YAML has a `status`, that value wins.
2. If the PR is merged, it's `adopted`.
3. A PR closed without being merged is `rejected`.
4. Anything else (open, draft) is `running`.

A Draft PR counts as `running`, but the viewer shows it separately as a "draft". On the 3D island it appears as a sprouting mound.

## How the parent is decided

1. If the YAML has a `parent`, that's what's used. In `research@vN` form it attaches straight to that version; if that version doesn't exist, you get a warning and it connects to research's first version.
2. With no `parent`, the PR's base branch is used. If the base is `research` and there are version tags, it attaches to whichever version was the latest when the experiment started.
3. If the parent is neither `research` nor an `experiment/*` node in the tree (the parent branch has no PR, or its PR is hidden), the node is marked an **orphan** and attached under the root. The experiment node itself isn't hidden.
4. If the parent relationships form a cycle (A → B → A), it gets a **cycle** warning badge and is attached under the root.

## Sibling order and generations

- Children with the same parent are sorted by the time their experiments started.
- The level right under the root is generation 1, and each step down adds one generation. Version nodes carry a generation too.

## Where the data comes from

- PR list: `GET /repos/{owner}/{repo}/pulls?state=all` (paginated)
- Version tags: `GET /repos/{owner}/{repo}/tags`, plus the tag commit dates
- GitHub is the single data store — no separate database and no server-side cache. API responses are cached with ETag conditional requests to save rate limit.
