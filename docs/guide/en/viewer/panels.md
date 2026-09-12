# The detail panel and the version panel

Click a node and a panel opens on the right. On a narrow screen it slides up from the bottom instead. Close it with the ✕ in the panel's top right or with Esc.

## The experiment detail panel

The head of the panel tells you:

- `Experiment · #PR number` and the PR title
- **Path**: the nodes you pass through from the root to this experiment, versions included. Click one to jump to it
- The status badge, whether it's a draft, and the full branch name
- The author, the date the PR was opened, and the merge or close date

If there are warnings, they show at the top of the **Overview** tab.

### Tabs

| Tab | What's in it |
|---|---|
| **Overview** | `hypothesis` (what you want to find out), `change` (what you changed), the PR body below the YAML block (rendered as markdown), `tags`, and the claims it tests (`claims`). The **Edit** button lets you fix the hypothesis, the change, the status, the tags, the W&B link and the whole body below the YAML (conclusions, notes, anything) right there |
| **Discussion** | The PR's comments and code review comments. Leave a comment in markdown in the box at the bottom |
| **Metrics** | The `metrics` table, showing this experiment, its parent and the change (Δ) side by side. If the parent is a version, the baseline is the metrics of the experiment at the end of the trunk that version came from |
| **Commits** | The branch's commits. Click one to open it on GitHub |
| **Files** | The PR's changed files. Each one shows how many lines were added and removed, and clicking it unfolds the diff (first 400 lines per file) |
| **Spec** | The sections this branch added, changed or removed in the spec document, compared with where it forked. Click one to unfold its line-by-line changes. For a rejected experiment it tells you the change stayed a proposal ([Intent- and spec-driven development](/rules/spec)) |

The color of a metric's change (Δ) is decided from the key name. Keys like `loss`, `wer`, `cer`, `error`, `latency` and `ppl` are treated as better when lower; `acc`, `score`, `bleu`, `f1` and `mos` as better when higher. Keys it can't figure out get no color.

### Buttons and links

- **Open on GitHub**: opens the PR page in a new tab (in VS Code, in your default browser).
- **Training log**: shown when the YAML has a `wandb` field.
- **Checkout** and **Diff vs parent**: only available in the [VS Code extension](/guide/vscode).
- **Derived experiments**: chips for the child experiments grown from this one (and the version it produced). Click one to jump straight to that node.

::: tip Editing is safe
When you save with **Edit**, only the fields you changed (`hypothesis`, `change`, `status`, `tags`, `wandb`) change in the YAML block. Other fields like `metrics` or `parent`, along with comments and key order, stay exactly as they were. Leave the status on **Auto** and the `status` field is removed, so it follows the PR state (merged or closed). If the body changed on GitHub after you loaded the tree, the viewer won't overwrite it — it asks you to refresh instead. From your training code you can record metrics with [`rt.log()`](/guide/tracking).
:::
## The version panel

Click a stone monument (in 3D or flat) and the version panel opens. For the first version, `v1`, click the old `research` tree. The version panel has two tabs, **Overview** and **Spec**.

![The version panel](/images/readme/en/version-panel.png)

| Item | What's in it |
|---|---|
| Head | The version name (`research v2`), the tagged commit SHA, the tag date |
| **Merged experiments** | The adopted experiments that made this version |
| **Metrics of this version** | The metrics of the experiment at the end of the trunk this version came from |
| **Experiments started from this version** | Experiments with `parent: research@v2`, or started from research at this version |
| **Next version** | The version that follows |
| **Label metric** | The metric to show on this island's node labels. The keys recorded by this island's experiments are listed most-used first, and **None** turns it off ([Label metric](/viewer/navigation)) |

That table is the **Overview** tab. The **Spec** tab shows the spec document as of that version in three modes — **Full**, **Summary** and **Changes** (against the previous version) — and you can unfold the history of each section. The spec tab of the newest version is the current, final spec ([Intent- and spec-driven development](/rules/spec)).

For the rules, see [Research version tags](/rules/versions).
