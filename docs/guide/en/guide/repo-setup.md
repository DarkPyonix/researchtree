# Setting up your repo

ResearchTree treats one repo as one research project. Before you open the viewer, set up three things in your research repo.

## 1. Create the `research` branch

`research` is the root of the research tree. It holds the first implementation that every experiment starts from, and it's where adopted experiments end up. Create the branch from the commit where your first implementation is done.

```bash
git switch -c research
git push -u origin research
```

Branches like `main` and `develop` stay exactly as they are, for regular development and releases. Those branches and their PRs never show up in the research tree.

::: tip If you'd rather use different names
The root branch name (`research`) and the experiment branch prefix (`experiment/`) are just defaults. If they don't fit your repo, you can change them freely in the viewer's [branch settings](/viewer/navigation). Wherever this guide says `research` or `experiment/`, read it as whatever names you picked.
:::

If the repo doesn't have a root branch yet, the viewer shows a "no research branch" message with the command to create one instead of the tree. You can also open the branch settings straight from that screen.

## 2. Turn off automatic branch deletion after merge

In your GitHub repo, go to **Settings → General → Pull Requests** and turn off **"Automatically delete head branches"**.

If a merged parent experiment branch gets deleted, the base branch of the child PRs derived from it changes, and the tree relationships get tangled. Rejected experiment branches are valuable records too, so don't delete those either.

## 3. Tag the first version `research/v1`

Put the version tag `research/v1` on the first implementation commit of the `research` branch. From then on, every time an adopted experiment is merged into `research`, tag it `research/v2`, `research/v3`, and so on to record the main line of the research ([research version tags](/rules/versions)).

```bash
git switch research
git tag -a research/v1 -m "v1: first implementation"
git push origin research/v1
```

The tree still works without any tags. In that case, though, the `research` branch alone becomes the root, and no version monuments appear in the viewer.

## 4. Open your first experiment

```bash
git switch -c experiment/baseline research/v1     # branch off the research/v1 tag
# ... edit code, commit ...
git push -u origin experiment/baseline
```

On GitHub, open a **draft PR** with `research` as the base, and put a YAML block like this at the top of the body.

````markdown
```yaml
parent: research@v1
hypothesis: training with the baseline settings as-is converges below val_loss 2.9
change: baseline training settings
tags: [baseline]
```

## Notes
First experiment.
````

For the full format, see [PRs and the body YAML](/rules/pull-requests). Once you're set up, open the tree whichever way suits you: [hosted web](/guide/web), the [VS Code extension](/guide/vscode), or [running locally](/guide/local)!
