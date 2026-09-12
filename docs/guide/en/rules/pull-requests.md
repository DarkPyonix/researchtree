# PRs and the body YAML

## PR rules

- Open one PR per experiment branch. Open it as a Draft PR right when the experiment starts.
- Set the PR's base to the parent branch: the parent experiment branch for a derived experiment, or `research` if it started from research.
- Put the hypothesis you're testing in the PR title, in one clear line.
- When you conclude an experiment:
  - **Adopted:** merge it into the parent branch (`research` or the parent experiment). If you merged into `research`, don't forget the next version tag ([research version tags](/rules/versions)).
  - **Rejected:** write the conclusion in the body and close the PR. Leave the branch alone — don't delete it.
- When one of several candidate ideas is adopted, close all the other PRs to keep things tidy.

## PR body format

Put one `yaml` code block at the very top of the PR body. The viewer only reads the first `yaml` block, so below it you can write whatever markdown you like.

````markdown
```yaml
parent: experiment/baseline-moshi
hypothesis: halving the depth transformer lr reduces early divergence
change: lr 3e-4 → 1.5e-4
metrics:
  val_loss: 2.31
  wer: 0.184
wandb: https://wandb.ai/...
status: rejected
tags: [lr]
```

## Conclusion
Divergence did go down, but convergence was too slow. Rejected.

## Notes
...
````

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `parent` | recommended | string | The parent experiment branch name. If it started from research, write it as `research@vN`; leave it empty and the PR's base branch is used |
| `hypothesis` | **required** | string | The hypothesis you're testing, in one sentence |
| `change` | recommended | string | A summary of the code or config change |
| `metrics` | optional | map&lt;string, number \| string&gt; | The final metrics. Name the keys however your team agreed to |
| `wandb` | optional | URL | A link to an external dashboard, like your training curves. It becomes the "Training record" link in the detail panel |
| `status` | optional | `running` \| `adopted` \| `rejected` | Only use this to override the value inferred from the PR state |
| `tags` | optional | list&lt;string&gt; | Tags for grouping (for example `lr`, `data`, `arch`) |
| `started` | optional | date `YYYY-MM-DD` | The day the experiment started. Leave it empty and the branch's first commit is checked, then the PR creation time ([Timeline and seasons](/viewer/seasons)) |
| `ended` | optional | date `YYYY-MM-DD` | The last day you worked on it. Leave it empty and the branch's last commit is checked, then the PR merge/close/update time |
| `claims` | optional | list&lt;string&gt; | The claim ids from the intent document this experiment tests (for example `[N1]`). [Intent- and spec-driven development](/rules/spec) |
| `spec` | optional | `none` | Marks an experiment that only tunes values and doesn't change the spec |

- Unfamiliar fields that aren't defined here are ignored, never deleted. When the viewer or `rt.log()` updates the body, the fields you wrote yourself and the markdown below the YAML are safely preserved. Comments and field order stay exactly as they were.
- The `## Conclusion` section is rendered as markdown in the detail panel under "Record · PR body". `rt.conclude()` adds or updates this section for you.

## Warning badges

Even if something's wrong with the body, the tree still draws fine. You just get a warning badge next to that node.

| Warning | Cause |
|---|---|
| No YAML block | The body has no `yaml` code block |
| YAML parse error | It isn't valid YAML syntax, or it isn't in `key: value` form |
| No hypothesis | `hypothesis` is empty |
| Invalid status / invalid field | The `status` value isn't one of the three, or a field's type doesn't match |
| Orphan | The parent branch can't be found in the tree (it gets attached under the root) |
| Cycle | The parent relationships loop as A → B → A (it gets attached under the root) |
| Missing version | The version tag in `parent: research@vN` doesn't exist (it gets attached to the first version) |

## Recommended metric keys

Early in a project, start with the keys below and add more as your team decides you need them.

- `val_loss`, `train_loss`
- `wer`, `cer`
- `steps`, `gpu_hours`

Once the keys line up, the **Metrics** tab in the detail panel can compute the change (Δ) against the parent, and the **label metric** you pick per island shows that same metric above every node in that version.
