# The 3D research island

When you open a repo, the first thing you see is the **research island**: a pastel voxel island viewed from above in isometric perspective. Every research version, starting with the root `v1`, gets its own island, and each experiment settles on the island of the version it branched from. Wide stretches of sea keep the islands apart, so version boundaries are easy to spot.

![The 3D research island](/images/readme/en/island.png)

## How to read the island

| On the island | What it means |
|---|---|
| **The big old tree** | The root: the `research` branch and the first version, `v1` |
| **Dirt paths** | Branches running from parent to child. Each branch has its own blend of colors, and a branch newly grown from the root or from a version picks up a new color and passes it down to its descendants |
| **Plants in a garden plot** | One experiment, planted in the garden plot at the end of a path |
| **Stone monuments and flags** | Research versions (`v2`, `v3`, …). They stand behind the adopted experiment that was merged into research, and new paths grow out from there |
| **Merge paths** | When several experiments came together in one version, these paths lead from the remaining experiments to that version |
| **Piers and ferries** | Wide sea separates the version islands. The path to the next version ends at a wooden pier on stilts at the island's edge, and on the water between islands a little ferry with a sail and a branch-colored flag bobs at its mooring |
| Flowers, grass, stones, bushes, clouds | Decoration. The shape of each island and its decoration come from the repo name, so they look the same every time you come back |

### Plant = status

| Plant | Status |
|---|---|
| A grown tree with fruit and a fence | **Adopted** (merged, or `status: adopted`) |
| A swaying sapling | **Running** (open) |
| A gray stump with fallen leaves | **Rejected** (closed, or `status: rejected`) |
| A mound with a sprout | **Draft** (draft PR) |

The tree's crown takes the branch color, and the season of the last work on it shows up as blossoms, fireflies, fallen leaves or snow ([Time axis and seasons](/viewer/seasons)).

## Label chips

A white label chip floats above each node. The chip shows only the branch name without its prefix, the [label metric](/viewer/navigation) value, and the status. If there is a YAML error or the node is an orphan, a warning badge rides along.

## Controls

| Action | How |
|---|---|
| Pan | Drag |
| Rotate | Right-drag |
| Zoom | Scroll |
| Select a node | Click the plant or its label chip — the camera moves in and the [detail panel](/viewer/panels) opens |
| Move between nodes | Arrow keys ([Keyboard](/viewer/navigation)) |
| Deselect | Esc |

A ring in the branch color pulses around the selected node. Experiments hidden by a [status layer](/viewer/navigation) fade out and turn translucent.

## The growing animation

The first time the view opens, paths reach out generation by generation and the plants grow. If you have "reduced motion" turned on in your operating system, this animation is skipped.

::: tip When there is no WebGL
The viewer draws with WebGL. If your browser can't use WebGL, you get a message saying the tree can't be drawn. The [flat view](/viewer/flat) uses the same 3D scene, so it isn't a fallback either. Check that hardware acceleration is on in your browser settings.
:::
