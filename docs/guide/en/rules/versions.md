# research version tags

`research` is the main line where adopted experiments pile up one after another. Tag a version every time an experiment lands, and the tree grows naturally along those versions.

```
research v1 ─┬─ experiment/a (rejected)
             └─ experiment/b (adopted) ── v2 ─┬─ experiment/c
                                              └─ experiment/d (adopted) ── v3 ─ …
```

## Rules

- Tag `research` with tags like `research/v1`, `research/v2`, `research/v3`. Dotted forms like `research/v1.1` work too. Only tags where `research/` is followed by `v` and a number count as versions, and they're sorted numerically.
- The root branch name goes in front of the tag so it never clashes with release tags on `main` (`v1`, `v2`, …). A bare `v2` isn't read as a version. If you rename the root branch, the prefix follows along (for example `trunk/v2`).
- On screen and in YAML we drop the prefix and just say `v2`. `parent: research@v2` points at the tag `research/v2`.
- `v1` is the project's initial implementation. That first version is the root of the whole tree.
- Once you've merged an adopted experiment into `research`, tag that merge commit with the next version and push it. It's fine to combine several experiments into a single version.
- An experiment that starts from research branches off the version tag it's based on. Leave the PR's base as `research` and write the base version in the YAML, like `parent: research@v2`.

## git command examples

**1. The first version**

```bash
git switch research
git tag -a research/v1 -m "v1: initial implementation"
git push origin research research/v1
```

**2. Starting an experiment from a version**

```bash
git switch -c experiment/depth-lr-warmup research/v1
# ... edit, commit ...
git push -u origin experiment/depth-lr-warmup
# Open a Draft PR on GitHub with base=research, and put parent: research@v1 in the YAML
```

**3. Adopted → merged → next version**

```bash
git switch research && git merge --no-ff experiment/depth-lr-warmup
git tag -a research/v2 -m "v2: adopt warmup"
git push origin research research/v2
```

If you merged with GitHub's "Merge pull request" button, pull the `research` branch locally, then tag the merge commit and push.

```bash
git switch research && git pull
git tag -a research/v2 -m "v2: adopt warmup"
git push origin research/v2
```

**4. Continuing from the new version**

```bash
git switch -c experiment/warmup-cosine research/v2
```

## How a version is placed in the tree

- Adopted experiments merged into `research` make up a new version. If the merge commit is the same as the version tag's commit, it belongs to that version; otherwise it belongs to the first version tagged after the merge.
- Each version continues from the **end of the adopted line** of the experiments it gathered. If an experiment merged into research has adopted, merged children, follow those children all the way down and that's the starting point — because the code contains every change down to that end.
- If there are several line ends, or several experiments land in one version, the version continues from the end that landed last, and all the other ends connect to the new island with dotted merge lines (a dock, in 3D). If nothing was merged, the version continues straight from the previous one.
- When several experiments land in one version at the same time, the remaining paths are joined by dirt-road **merge lines**.
- A version node's metrics follow the line-end experiment the version continues from, and they become the comparison baseline (Δ) for the experiments that branch off that version.
- On screen they're drawn as a stone monument with a flag. Each version gets its own island, and in the [flat view](/viewer/flat) the monument appears as seen from above.

::: tip If you haven't tagged anything
A PR with no `parent` and base `research` attaches to whichever version was the latest at the time the PR was opened, or at its `started` date. If you write a version that doesn't exist, like `parent: research@v9`, it gets a warning badge and connects to the first version. In a repo with no tags at all, just the `research` branch is drawn as the root of the tree.
:::

## Cleaning up branches when you cut a new version

Finished experiment branches pile up fast and get unmanageable. So when you tag a new version, you delete the finished branches all at once. Deleting an unmerged branch outright would leave its commits unreachable, so the record goes into `research` first.

| Branch | What happens |
|---|---|
| Already in `research` (adopted and merged) | Deleted right away |
| Never landed (rejected, etc.) | **Archive merge**: revert every commit on the branch → `--no-ff` merge into `research` → delete |
| Has descendant experiments still running | Left for now; cleaned up in a version after the descendants finish |
| Still running | Left alone |

- A revert isn't a reset. The original commits stay put and a reverting commit is added on top. So an archive merge doesn't change the code on `research` — the experiment commits and the revert commits both stay in the record.
- There's a reason branches with running descendants get skipped. If the parent's revert lands in `research` first, then merging the child later would pull out the parent code the child depends on.
- The PRs stay on GitHub, so the tree doesn't change. A rejected PR is already closed, so it still shows as rejected after the archive merge.

`researchtree release` does all of this for you.

```bash
git switch research && git merge --no-ff experiment/depth-lr-warmup   # adopted (or merge the PR on GitHub)
researchtree release            # plan only: delete / archive merge / hold
researchtree release --yes      # archive merge → tag research/v3 → push → delete branches
researchtree release v3.1 --yes # when you want to name the version yourself
```

- Run it from a local clone of the repo. The working tree has to be clean, and it uses a GitHub token (`researchtree login`) to read PR states.
- If you keep each experiment in its own folder with `git worktree`, remove the worktrees of finished experiments first (`git worktree remove <folder>`) and run it from the main clone. Git can't switch to or delete a branch that's checked out in another worktree. `--yes` checks for this before running, tells you which worktrees to remove, and stops. Worktrees of running experiments are fine to leave.
- If you don't give a version name, it uses the number after the last version (`v3` after `v2`). The tag goes on `research` once the archive merges are done.
