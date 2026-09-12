# Board view

The island shows how your research grew. The board shows **where the work stands right now**: the
same experiments, lined up the way a development team reads them.

Press **Board** in the toolbar to switch, and **Back to the island** to return. The viewer remembers
whichever one you looked at last.

## The five columns

The columns are the stages a pull request actually goes through. They come straight from GitHub, so
there is nothing extra to keep up to date.

| Column | What lands here |
|---|---|
| **Draft** | A PR opened as a draft: an experiment not ready for anyone else yet |
| **In progress** | Open, with no review requested |
| **In review** | A review has been requested from a person or a team |
| **Adopted** | Merged |
| **Rejected** | Closed without a merge |

Cards are ordered by what moved most recently, newest at the top.

## Reading a card

One card is one experiment. It shows the experiment name and PR number, the title, and then the
status, the label metric and the author. The small dot on the left is the same mark the island uses,
so running, adopted and rejected stay recognizable.

Click a card and the usual detail panel opens: hypothesis, change, metrics, commits and spec, all as
they are on the island.

Turning off **Running · Adopted · Rejected** on the repo card dims those cards here too. The columns
stay as they are and only the cards fade, so you can see what you left out.

## When it helps

- **Deciding what to do today**: whether the review column is empty, whether too much is in progress.
- **Sharing progress**: the state of the work, without the research story around it.
- **Tidying up**: drafts and in-progress cards that have not moved in a long time stand out.

::: tip The island and the board are the same data
Switching keeps your selection and your settings. An experiment you pick on the board is still
selected when you go back to the island.
:::
