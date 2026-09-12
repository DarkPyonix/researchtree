# Island: all your research on one map

One research grows into one island. The island map puts **all of them on one sea**, so a single
address shows everything you have worked on.

```
https://darkpyonix.github.io/researchtree/?user=b-re-w
```

::: info In progress
The map, the portals, the minimap and the researcher's introduction all work. The map is flat for
now; drawing each research as its real 3D island is the next step.
:::

## An island and a land are not the same thing

| Word | What it is | How you cross |
|---|---|---|
| **Island** | One research version (`research/v1`, `v2`, …) | Dirt paths and ferries: they are **connected** |
| **Land** | A group of research, one project | A **portal** takes you across |

Within one research the versions are connected islands; separate projects are separate lands. With
only one land there are no portals, just that land.

## Making the settings repository

If your account has a `.researchisland` repository, that is your map. The CLI is the quickest way.

```bash
researchtree island init                  # creates the .researchisland repository
researchtree island add DarkPyonix/moshi  # puts research on the map
researchtree island add DarkPyonix/tts --island Speech
researchtree island show                  # what is on the map now
researchtree island check                 # tells you what is written wrong
researchtree island remove DarkPyonix/tts
```

Run `researchtree island add` inside a repository and you can leave the name out.

## Writing it yourself

The map is the first ```` ```yaml ```` block of README.md in the `.researchisland` repository.
Everything outside the block is for people to read; the viewer never touches it.

```yaml
islands:
  - name: Speech          # the land's name (it appears on portals and on the scroll)
    at: [0, 0]            # where it sits on the map
    intro: SPEECH.md      # optional: a document introducing the land
    repos:
      - repo: lab/moshi   # owner/name
        at: [0, 0]        # where it sits within the land
      - repo: lab/tts
        at: [1, 0]
  - name: Vision
    at: [1, 0]
    repos:
      - repo: lab/depth
        at: [0, 0]
```

Branch names come from each repository's own `.researchtree`, so the map does not repeat them.

One bad line never empties the map: whatever could be read is shown, and
`researchtree island check` tells you about the rest.

## The researcher, and the résumé

Both open from the card at the top left of the map.

| What | Where it goes |
|---|---|
| Introduction | `PROFILE.md` in `.researchisland`. Without one, the README of your GitHub profile repository (`<user>/<user>`) stands in |
| Résumé | Put `resume.pdf`, `CV.md` or the like in `.researchisland` and a **Résumé** button appears |

If everything on the map is public, all of it shows without a sign-in: one address becomes your
research portfolio.
