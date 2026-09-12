# Training script integration

Install the Python package in your training project and your training code can update the PR body of the current branch directly. No more copying metric numbers over by hand.

```bash
uv add researchtree        # or pip install researchtree
```

```python
import researchtree as rt

rt.log(val_loss=2.31, wer=0.184)              # merged into metrics
rt.set(wandb=run.url)                         # set any YAML field
rt.conclude("rejected", "Converges too slowly")  # set status + write the '## Conclusion' section
```

## API

| Function | What it does |
|---|---|
| `rt.log(**metrics)` | Merges values into `metrics` in the PR body YAML. Pass `None` for a metric to remove it |
| `rt.set(**fields)` | Sets any YAML field you want (`wandb`, `tags`, `change` …). Pass `None` to remove a field |
| `rt.conclude(status, text, heading=None)` | Sets `status` to one of `running` / `adopted` / `rejected` and writes the conclusion section with `text`. If the body already has a `## 결론` or `## Conclusion` section, it keeps that heading and replaces only the content; if not, it creates one with `heading` (default `결론`, or pass `heading="Conclusion"` for English) |

The body is edited losslessly, so nothing you already wrote is lost. Only the first `yaml` block changes; comments, field order, fields people added, and the markdown below the YAML block all stay intact. If the body has no block, one is added at the top. And if the existing YAML is broken, it's never overwritten — you just get a warning.

## How it works

1. It finds the current branch with `git rev-parse --abbrev-ref HEAD`.
2. If the branch name doesn't start with the experiment prefix (`experiment/`), it skips writing.
3. It works out the repo from the `origin` remote (or you can set `RESEARCHTREE_REPO` yourself).
4. It looks for a PR with that branch as its `head`. If there are several, open PRs win.
5. So it never overwrites someone else's edit, it re-reads the PR body right before writing, merges, and then sends a `PATCH`. On failure it retries once.

## It never stops your training

The `rt.*` functions are built so they never raise, no matter what. If the branch isn't an experiment branch, if there's no PR, no token, or the network is down, you just get a `RuntimeWarning` and it moves on. A training run you've babysat for hours will never die because logging failed, so use it without worry.

## Distributed training

In any process where `RANK` or `LOCAL_RANK` isn't `0`, it does nothing at all. Only the rank 0 main process updates the PR, so in a distributed setup you can leave the calls in the code on every rank.

## Environment variables

| Variable | What it's for |
|---|---|
| `RESEARCHTREE_TOKEN` | A GitHub token. When set, it wins over the saved token. Handy for putting a PAT on a GPU server or in CI |
| `RESEARCHTREE_REPO` | The repo (`owner/name`). Set it when the `origin` remote can't tell us |
| `RESEARCHTREE_CLIENT_ID` | The OAuth App client ID used by `researchtree login` (Device Flow). Set it to use your own app instead of the default one |

## Tokens

It uses the same token you saved with `researchtree login` or by signing in to the local viewer. The lookup order is `RESEARCHTREE_TOKEN` → OS keychain → config file. For the exact paths, see [Running locally · Where the token is kept](/guide/local).

::: tip On a server with no browser
- With an OAuth App ready: run `researchtree login` on the server, then enter the code it prints at `github.com/login/device` in a browser on another device.
- Right now: create a fine-grained PAT (Pull requests read/write, Contents read on the target repo) and put it in `RESEARCHTREE_TOKEN`.
:::

## Example: a PyTorch training loop

```python
import researchtree as rt

for epoch in range(epochs):
    train_one_epoch(model)
    val = evaluate(model)
    # Safe to call on every rank; only rank 0 writes.
    rt.log(val_loss=round(val.loss, 4), wer=round(val.wer, 4), steps=global_step)

rt.set(wandb=wandb.run.url)
rt.conclude("adopted", f"val_loss {val.loss:.3f}, better than the parent. Adopted.")
```

Even when `conclude` writes the status, you still have to merge or close the PR yourself on GitHub ([PR rules](/rules/pull-requests)).
