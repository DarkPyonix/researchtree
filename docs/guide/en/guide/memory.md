# Agent memory

ResearchTree's records aren't only for people to read. The same Python package loads the whole PR tree as **typed Python objects**, so a coding agent can walk through past experiments, gather them, and check them, all in code.

It's not like a few notes scattered across markdown files. Every experiment keeps its hypothesis, metrics, parent and status in a fixed place, and there's a hierarchy running from version (island) → experiment → body and commits. Questions like "how many experiments have been rejected so far?" or "which experiment on island v5 has the lowest `val_loss`?" become a one-line computation instead of a search.

::: tip Where the idea comes from
User as Code (Bojie Li, 2026, [arXiv:2606.16707](https://arxiv.org/abs/2606.16707)) proposes keeping an agent's memory of the user as typed Python code rather than text. The core ideas: a log you append to and never erase, typed state structured out of that log, rules that run on top of the state, and a short summary (a manifest) you always keep in context. In ResearchTree the commits and PRs are the log you never erase, and the YAML in the PR body is the typed state. There's no separate structuring step — the moment you write it down, it's already structured.
:::

## Loading

```bash
uv add researchtree        # or pip install researchtree
```

```python
import researchtree as rt

research = rt.load()                         # the origin repo of the current folder
research = rt.load("DarkPyonix/researchtree-test")
print(research.manifest())                   # start here
```

- It uses the token you saved with `researchtree login`, or `RESEARCHTREE_TOKEN`. Public repos read fine with no token.
- The root branch and the prefix come from the repository's `.researchtree`. To read one repository differently just this once, pass them in: `rt.load(root="trunk", prefix="exp/")`.
- The tree is built with the same rules as the viewer ([tree rules](/rules/tree-rules)). Both implementations are checked against the same test fixtures.

## Going from the top down

An agent's context is limited, so start with the short summary and open up only what you need.

| Level | Call | What you see |
|---|---|---|
| Summary | `research.manifest()` | Experiment counts and best results per island (version), running experiments, warnings, and what to call next |
| Island | `research.version("v3").describe()` | The experiment that produced that version, the island's experiments, the best per metric |
| Experiment | `research["duet-mix"].describe()` | Hypothesis, change, metrics and Δ against the parent, conclusion, children, W&B link |
| Body | `.body`, `.sections`, `.conclusion` | The PR body markdown (minus the YAML block) and the text of each section |
| Source | `.commits()`, `.comments()`, `.files()` | Branch commits, PR comments, changed files. Read from GitHub the first time you call them |

## Objects

```python
research.versions            # [Version(v1), Version(v2), ...]  the root is the first version
research.root                # the root = the island of the first version
research.latest              # the most recent version
research.experiments         # Experiments, sorted by start order
research["duet-mix"]         # look up by short name, branch name, or PR number
research.version("v3")       # a version name, or research@v3
```

**Version**: `name`, `date`, `sha`, `merged` (the adopted experiment that produced this version), `experiments` (the experiments on this island), `started_here`, `parent`, `children`, `next`, `previous`, `grown_from` (the tips of the adopted lines that were merged in; the last one is the parent), `metrics` (the metrics of the experiment at the tip of the line this version continues)

**Experiment**: `name`, `branch`, `number`, `url`, `title`, `author`, `status`, `draft`, `hypothesis`, `change`, `metrics`, `wandb`, `tags`, `started`, `ended`, `season`, `version` (the island it lives on), `parent`, `children`, `siblings`, `ancestors()`, `descendants()`, `path`, `produces` (the version this experiment created), `baseline`, `delta(key)`, `improved(key)`, `warnings`, `meta` (the whole YAML)

**Experiments** is a plain list, so comprehensions work as-is, with a few helpers on top.

```python
adopted = research.experiments.where(status="adopted")
adopted.best("val_loss")                         # guesses the direction from the name (loss/ppl/wer: lower is better)
research.experiments.where(version="v5").sort_by("audio_loss")
research.search("lora").names                    # searches names, hypotheses, changes, tags and bodies
print(research.experiments.with_metric("tts_wer").table("tts_wer", "asr_cer"))
```

## One-line computations

```python
# rejected experiments per version
{v.name: len(v.experiments.where(status="rejected")) for v in research.versions}

# experiments rejected even though they beat their parent: worth another look
[e.name for e in research.experiments.where(status="rejected") if e.improved("val_loss")]

# the longest-running experiment
max(research.experiments, key=lambda e: e.ended - e.started)

# walk back up to see which experiments it came from
[n.name for n in research["duet-mix"].path]
```

## Intent- and spec-driven development

Alongside the experiment records, you can read the repo's intent document (`INTENT.md`) and spec document (`SPEC.md`) per version. How that way of working goes, how to write the documents, and where to put them is in [intent- and spec-driven development](/rules/spec).

```python
spec = research.spec()                     # the spec of the latest version (research.version("v3").spec() works too)
print(spec.summary())                      # just the titles and summary lines
research.version("v4").spec_changes()      # sections changed since the previous version
research["duet-mix"].spec_changes()        # sections changed since the point the experiment branched off
research.spec_history("vocoder")           # the versions in which one section changed
research["duet-mix"].claims                # the claim ids this experiment tests (YAML claims)
research.claims()                          # {"N1": Experiments, ...}
```

Before proposing an experiment, an agent can read the current design and claims with `researchtree spec --summary` and `researchtree spec --intent`.

## Rule checks

`research.check()` runs rule functions over the tree and gives back warnings. There's no LLM involved — the checks are deterministic, so you get the same result every time.

| Rule | Warning |
|---|---|
| `stale-running` | An experiment still running with no work for over two weeks |
| `adopted-regression` | An experiment adopted even though not a single directional metric beat the parent. When only some got worse, you get `adopted-tradeoff` (informational) instead |
| `adopted-without-metrics` | An experiment adopted with no metrics |
| `no-conclusion` | An experiment that ended with no conclusion section |
| Body warnings | No YAML block, YAML error, no hypothesis, orphan, cycle, missing version |

A rule is just a plain function of the form `(research) -> list of warnings`. An agent can write its own and pass it in.

```python
from researchtree.memory.rules import Alert

def no_wandb(research):
    for e in research.experiments.where(status="adopted"):
        if not e.wandb:
            yield Alert("info", "no-wandb", "Adopted but has no W&B link", e.name)

research.check([no_wandb])
```

## From the terminal

```bash
researchtree memory                 # summary
researchtree memory v3              # one island
researchtree memory duet-mix        # an experiment card
researchtree memory --check         # warnings only
researchtree memory --json > tree.json
```

When you hand work to an agent, give it the `researchtree memory` output as its first context and let it dig up anything more from Python itself.

## Installing the agent skill

So that coding agents like Claude Code or Codex follow the ResearchTree rules, the package ships a skill file (`SKILL.md`, in English). It covers writing rules so people can read them (that part comes first), how to split up the intent, spec and evidence documents, how to give each experiment its own working folder with `git worktree`, how to create experiment branches and PRs, the PR body format, how to record with `rt.log()`, the memory API from this page, how to cut a version with `researchtree release`, and what agents must not do.

```bash
researchtree skill install                  # installs into whichever of .claude/skills or .agents/skills already exists at the repo root
researchtree skill install --target claude  # only into .claude/skills/researchtree/SKILL.md (agents and all also work)
researchtree skill show                     # prints the contents
```

- It installs at the repo root no matter which folder in the repo you run it from. If neither folder exists, it creates both.
- Run it again after updating the package and it refreshes the contents. If they already match, it leaves it alone.
- Commit the installed file and every agent on the team works from the same rules.

## Offline

You can build a tree from GitHub responses you already have. Handy in tests or a notebook.

```python
research = rt.from_data(prs, "owner/repo", tags=tags)   # a list of GitHub PR objects and {name, sha, date} tags
```

A tree built offline can't read commits, comments or files. Calling those raises an error.
