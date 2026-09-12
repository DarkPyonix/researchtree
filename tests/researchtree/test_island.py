from __future__ import annotations

from researchtree.island import IslandMap, Land, Research, dump_map, new_readme, next_spot, parse_map, write_map

SETTINGS = """# My research

Some prose that belongs to me.

```yaml
islands:
  - name: Speech
    at: [0, 0]
    intro: SPEECH.md
    repos:
      - repo: lab/moshi
        at: [0, 0]
      - repo: lab/tts
        at: [1, 0]
        root: main
        prefix: try/
  - name: Vision
    at: [1, 0]
    repos:
      - repo: lab/depth
        at: [0, 0]
```

More prose, after the block.
"""


def test_reads_islands_and_their_research():
    m = parse_map(SETTINGS)
    assert [i.name for i in m.islands] == ["Speech", "Vision"]
    speech = m.islands[0]
    assert speech.at == (0, 0)
    assert speech.intro == "SPEECH.md"
    assert [(r.repo, r.at) for r in speech.repos] == [("lab/moshi", (0, 0)), ("lab/tts", (1, 0))]
    assert m.warnings == []


def test_branch_settings_fall_back_to_the_defaults():
    m = parse_map(SETTINGS)
    moshi, tts = m.islands[0].repos
    assert (moshi.root, moshi.prefix) == ("research", "experiment/")
    assert (tts.root, tts.prefix) == ("main", "try/")


def test_a_broken_entry_is_dropped_and_the_rest_survives():
    m = parse_map(
        """```yaml
islands:
  - name: Speech
    repos:
      - repo: not-a-repo
      - repo: lab/moshi
      - repo: lab/moshi
      - nonsense
  - at: [0, 0]
```"""
    )
    assert [r.repo for r in m.islands[0].repos] == ["lab/moshi"]
    assert len(m.warnings) == 4  # bad name, duplicate, not an entry, island without a name


def test_a_file_with_no_map_says_so_instead_of_failing():
    assert parse_map("# just prose").warnings == ["no ```yaml block in the settings file"]
    assert parse_map("```yaml\n- 1\n- 2\n```").warnings == ["the yaml block is not key: value pairs"]
    assert parse_map("```yaml\nislands: 3\n```").warnings == ["islands: must be a list of lands"]
    assert parse_map("```yaml\nislands: [oops\n```").warnings[0].startswith("the yaml block could not be read")


def test_writing_keeps_every_word_around_the_block():
    m = parse_map(SETTINGS)
    m.islands[0].repos.append(Research("lab/vocoder", (2, 0)))
    out = write_map(SETTINGS, m)
    assert out.startswith("# My research\n\nSome prose that belongs to me.")
    assert out.rstrip().endswith("More prose, after the block.")
    assert [r.repo for r in parse_map(out).islands[0].repos] == ["lab/moshi", "lab/tts", "lab/vocoder"]


def test_a_map_round_trips():
    m = IslandMap(islands=[Land("Speech", (0, 0), repos=[Research("lab/moshi", (1, 2), root="main")])])
    again = parse_map(f"```yaml\n{dump_map(m)}\n```")
    assert again.warnings == []
    assert again.islands[0].repos[0].at == (1, 2)
    assert again.islands[0].repos[0].root == "main"


def test_a_new_readme_carries_the_map_and_the_address():
    text = new_readme("b-re-w", IslandMap(islands=[Land("Speech", (0, 0), repos=[Research("lab/moshi")])]))
    assert "?user=b-re-w" in text
    assert [i.name for i in parse_map(text).islands] == ["Speech"]


def test_next_spot_fills_rows_of_three():
    assert next_spot([]) == (0, 0)
    assert next_spot([(0, 0), (1, 0)]) == (2, 0)
    assert next_spot([(0, 0), (1, 0), (2, 0)]) == (0, 1)
