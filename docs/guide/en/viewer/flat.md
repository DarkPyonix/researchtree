# The flat view

The view button in the toolbar cycles through four views. The button is labeled with the view you'll get if you press it. (The work board has its own button next to it: [Board view](/viewer/board).)

| Current view | Button | What happens |
|---|---|---|
| Island (the first screen) | **Flat view** | From wherever you are, the island flattens into a top-down plane |
| Flat | **Tree view** | The plane stays flat but turns, putting research v1 at the bottom and the newest version at the top |
| Tree | **3D view** | Keeping that direction, the island rises back into 3D |
| 3D tree | **Island view** | Back to the angle of the first screen, showing the whole thing |

Switching views keeps whichever node you had selected, and the view you used last is remembered for your next visit.

![The flat view](/images/readme/en/flat-tree.png)

## The press-down transition

The flat view isn't a separate screen — it's the **same 3D scene**. Nothing reloads; it just plays out smoothly where you are.

- **3D → flat**: the camera swings to a straight-down view while the plants are pressed flat onto the ground. The land and water, the piers and ferries and the surrounding decoration are hidden, leaving the dirt paths, the garden plots with their flattened plants, the version stones and the label chips on a dotted background. The paths that crossed the sea between islands turn into dotted path tiles, so a branch runs on without a break.
- **Flat → 3D**: the flattened island rises again and settles back into the original isometric view.

![The press-down effect](/images/readme/en/press-down.png)

## How to read the flat view

- The layout is the same as the [3D island](/viewer/island). Everything grows to the right from the root (`research`), and branches other than `research` and `experiment/*` never appear.
- The horizontal axis follows [time](/viewer/seasons). Experiments sit at their start date and versions at their tag date, and a child is always placed to the right of its parent. A year chip marks each year boundary, and just below the repo info card in the top left you'll see the year and season at the center of the screen.

| Element | What it means |
|---|---|
| Dirt path | A branch running from parent to child. Each branch has its own blend of colors |
| Garden plot with a pressed plant | One experiment. The plant's shape shows its status, just like on the 3D island |
| Stone monument (seen from above) | A research version |
| Merge path | The version merge line. It ties in the remaining experiments that came together in one version |
| Dotted path | The path across the sea between islands — where the piers and ferries are in the 3D island |
| Exclamation badge | A warning: a YAML error, a missing required field, an orphan node, and so on |

Each node's label shows the branch name, with the [label metric](/viewer/navigation) value and the status in small text underneath.

## Controls

Drag to pan and scroll to zoom. You can't rotate in the flat view. Clicking a node opens the detail panel, and the keyboard controls are the same as in 3D ([Navigation and tools](/viewer/navigation)).
