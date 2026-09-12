# Intent- and spec-driven development

**Spec-driven development (SDD)** means writing the spec before the code and building to that spec. The spec becomes the single source of truth for "what the system is right now," and people and coding agents alike work from it. It caught on as more of us started building alongside agents.

ResearchTree adapts it for research. Ordinary spec-driven development assumes you already know what you're building, so it treats the spec as settled requirements. In research you can't know the outcome ahead of time. So in ResearchTree, **a spec change is a hypothesis**, and the experiment's result (adopted or rejected) decides whether that change goes into the spec. There's also one more layer in front of the spec: **intent**. You write down what you're claiming with this design, and experiments test those claims.

In short, **intent- and spec-driven development is spec-driven development with a verdict attached**.

## Three documents

| Document | The question it answers | Where it lives | When it changes |
|---|---|---|---|
| **Intent** | Why are we doing this? What are we claiming? What are we not doing? | `INTENT.md` on the `research` branch | Rarely, and deliberately |
| **Spec** | What is the system right now? | `SPEC.md` on the `research` branch | When an experiment that changes the design is adopted |
| **Evidence** | What did we try, and what did we learn? | The PR body of each experiment | With every experiment |

Plans and to-do lists don't get documents. One to-do is one draft PR.

## Core principles

1. **Intent comes first.** Write what you're claiming in `INTENT.md` with ids (`N1`, `N2`, …), and have each experiment say which claim it tests.
2. **The spec is the baseline.** The implementation follows the spec, and the spec holds only the current design, written as decisions. People and agents both read the spec first to understand the design.
3. **Design changes happen one experiment at a time.** An experiment that changes the design edits the spec first on its own branch, then implements it on that same branch. The spec edit and the code go into one PR together.
4. **The verdict settles the spec.** If it's adopted, the spec edit lands in `research`; if it's rejected, it stays a proposal. That way a version's spec holds only designs that passed.
5. **Evidence belongs in the PR.** Measurements, comparison tables, and derivations go in the experiment PR; the spec just links to them.

## The development flow

| Step | What you do | Where it ends up |
|---|---|---|
| 1. Set the intent | Write the problem, goals, claims, non-goals, and open decisions | `INTENT.md` |
| 2. First spec | Write the design of the first implementation section by section, and tag the first version | `SPEC.md`, `research/v1` |
| 3. Propose an experiment | Pick a claim to test or an open decision to answer, then open a branch and a draft PR | `hypothesis` and `claims` in the PR YAML |
| 4. Spec first, implementation next | On that same branch, edit the sections you're changing first, then implement to that spec and train and measure | `SPEC.md` on the branch, the code, `rt.log()` |
| 5. Verdict | Write the conclusion and adopt it (merge) or reject it (close) | The PR's conclusion |
| 6. Version | Gather the adopted designs and tag `research/vN`. If a claim changed, fix the intent document too | `SPEC.md` and `INTENT.md` as of `research/vN` |

An experiment that only tunes values doesn't touch the spec at step 4. Writing `spec: none` in the PR YAML makes that intention clear.

## How it differs from ordinary spec-driven development

| | Ordinary spec-driven development | ResearchTree's intent- and spec-driven development |
|---|---|---|
| What a spec change is | Settled requirements | A hypothesis to test |
| Unit of change | A feature or a task | One experiment (one branch, one PR) |
| When it lands in the spec | When the implementation is done | When the experiment is adopted |
| Changes that aren't adopted | Thrown away and gone | Kept as a rejected PR and an archive merge |
| Versioning of the spec | A branch or a release | A spec fixed at each `research/vN` tag |
| Link to the purpose | Optional | Linked through the intent document's claims and the PR's `claims` |

## File locations: `.researchtree`

The default paths are `SPEC.md` and `INTENT.md`. If your repo uses different names, put a `.researchtree` at the top of the root branch (`research`) and write the paths there. This file is shared configuration for the whole team.

```yaml
spec: docs/PHASE.md      # spec document (default SPEC.md)
intent: docs/INTENT.md   # intent document (default INTENT.md)
prefix: experiment/      # experiment branch prefix (default experiment/)
```

- The viewer, the CLI, the Python API, and the agent skill all read this file.
- `root` and `prefix` are decided by this file; the viewer has no branch settings of its own. In Python, `rt.load(root=…, prefix=…)` reads one repository differently just this once.
- The file is called `.researchtree`; the older name `.researchtree.yml` is still read. Put it on the repository's default branch (usually `main`). It is not inside the root branch, so it can name the root branch with `root`. A file left on the root branch is still read.
- Unknown keys and invalid values are ignored, and the viewer's settings window shows you what it ignored.

## How to write a spec

**Write decisions only.** Keep just what the system does, which formulas it uses, and which values you picked. Derivations, measurements, and comparison tables go in the PR; the spec only links to them.

```markdown
### Gradient gain
> Gradients for pretrained rows are 0; new rows use k ≈ 1.44x.

Only the step length is restored, not the read-direction component.

Evidence: experiment/gradient-gain (#22)
```

- **The first line of every section is a one-line `>` summary.** Collect just the headings and summaries and the whole design fits on one page (`researchtree spec --summary`, the **Summary** view in the viewer).
- **One section is one feature.** That way an experiment's spec change reads as "which feature did it add or fix."
- **Write only the current state.** History like "we used to use X" or "we tried Y and rejected it" lives in Git and the PRs. The viewer shows you the history per section.
- **Keep a section within one screen (40 lines).** If it runs over, first look for evidence you can move into a PR. `researchtree spec --check` flags sections with no summary line and sections that are too long.
- **Try not to rename headings.** Sections are recognized by their heading. If you do have to rename one, add an id first — then the section carries on as the same section even after the rename. The id comment isn't visible on GitHub either.
  ```markdown
  ## Preserving English and duplex ability <!-- id: p1-english -->
  ```
- **Split the document into files as it grows.** Leave an include comment where you took the content out, and the tools splice it back in place so it reads as one document. Paths are relative to the file that holds the comment.
  ```markdown
  <!-- include: phase1/gradient.md -->
  ```
  Don't change the content while splitting. A commit that only moves things isn't an experiment, so you can commit it straight to `research`.

## Verdicts and the spec

- The spec edits of an adopted experiment land in `research` along with the merge.
- Rejected branches get reverted and archive-merged by [`researchtree release`](/rules/versions). So a rejected spec proposal stays in the record but never enters a version's spec.
- The **Spec** tab in the viewer's experiment panel shows which sections the experiment changed, compared against the point it branched off. For a rejected experiment it tells you it "stayed a proposal."

## Intent and claims

- The intent document holds the problem, goals, constraints, non-goals, and the **claims**. Give each claim an id like `N1` or `N2`, and write the heading as something like `### N1. Training on speaking alone produces listening`.
- An experiment that tests a claim writes `claims: [N1]` in the PR YAML. It shows as a chip in the viewer's **Content** tab, and `researchtree spec --claims` gathers the experiments and results per claim.
- Questions whose answers would change a claim go in as **open decisions**, and once you have the answer you fix the intent document.
- If an adopted result contradicts a claim, don't leave the intent document as it is — fix it. An intent document left wrong means people and agents both work from a wrong premise.

## Viewing it in the viewer

**Version panel → Spec tab**

| View | What it shows |
|---|---|
| **Full** | The version's entire spec, section by section. Sections added, changed, or renamed since the previous version get a badge, and the clock button next to a section shows which versions it was added and changed in (along with the experiments that landed there) |
| **Summary** | One page of just the headings and summary lines |
| **Changes** | The list of sections changed since the previous version. Click one to expand its line-by-line changes |

The Spec tab of the latest version is your **current final spec**.

**Experiment panel → Spec tab**: the sections this branch changed in the spec. The baseline is the commit the branch split off from.

## Terminal and Python

```bash
researchtree spec                    # the latest version's spec (one document with includes spliced in)
researchtree spec v3                 # a specific version
researchtree spec --summary          # headings and summary lines only
researchtree spec --diff             # sections changed since the previous version, with line-by-line changes (--diff v2 to compare against another version)
researchtree spec --experiment duet-mix   # the sections one experiment changed in the spec
researchtree spec --history vocoder  # the history of one section (by section key)
researchtree spec --check            # missing summary lines, overlong sections, includes that couldn't be read
researchtree spec --claims           # the experiments that tested each claim
researchtree spec --intent           # the intent document (can be combined with other options)
researchtree spec --out SPEC-v5.md   # save to a file
```

```python
spec = research.spec()                     # latest version (research.spec("v3"), research.version("v3").spec())
print(spec.summary())
spec["vocoder"].summary, spec["vocoder"].body
research.version("v4").spec_changes()      # section changes since the previous version
research["duet-mix"].spec_changes()        # against the point the experiment split off
research.spec_history("vocoder")           # [(Version, "added"), (Version, "changed"), ...]
research.claims()["N1"]                    # the experiments that tested N1 (Experiments)
research.intent()                          # the intent document
```

## How sections are recognized

- One section per `#` heading. A `#` inside a code block isn't a heading. Text before the first heading is the "preamble" section.
- A section's key is its id if it has one; otherwise it's built by joining the parent section's key and the heading (for example `vocoder/sample-rate`). The document title (`#`) isn't part of the key, so renaming the document title doesn't break the history.
- A section "change" means its own body under the heading changed. Trailing whitespace or blank lines around it don't count. If the body is the same and only the heading changed, that's a "rename." Renaming a heading without an id shows up as a "removal" plus an "addition."
- The viewer (TypeScript) and the CLI and Python use the same rules, and they're checked against the same test fixtures.
