# Time axis and seasons

The tree grows along with time. The position of a node and the scenery of its island tell you **when** an experiment happened.

::: info New
The time axis and the seasons were added recently. The details of how they look may still change.
:::

## The time axis

- The horizontal direction is the order experiments followed. Each step from parent to child moves **the same distance** to the right, and crossing to a new version's island adds a little more for the water. Whether the dates are days or months apart, the spacing is the same, so the tree spreads out evenly.
- Where a branch forks, the rows are spread generously apart, so branches heading off sideways stay clearly separated.
- Dates are used for the year marks and the season colors. A mark is drawn from the node's position to the node's date, so the date a mark points at never disagrees with the node's date.

### Year marks and the current year

- A **year chip** sits at each year boundary (January 1), and on the 3D island a stone band is laid there too. In the flat view, where the ground disappears, those year chips are how you spot the year boundaries.
- Just below the repo info card in the top left, you'll see the **year** (large) and the **season** (small) at the center of the screen. It's there in both 3D and flat, and as you move sideways you can watch the years and seasons go by.

## Seasons

Dates are sorted into northern-hemisphere seasons.

| Season | Months |
|---|---|
| Spring | March – May |
| Summer | June – August |
| Autumn | September – November |
| Winter | December – February |

- **The ground of the 3D island**: the color of the grass and the flower and bush decoration follow the season at that place on the time axis. Spring brings petals, summer deep grass, autumn golden fields, and winter a blanket of snow. Every research version has its own island, and you cross the sea between them by the ferry moored at the pier.
- **Experiment trees**: the crown keeps the color of its branch, and the season of **the last work on that experiment** shows as an effect. Which branch you worked on and how late into the year is right there in the scenery.

| Season | Effect on an experiment tree |
|---|---|
| Spring | Cherry blossoms open on the tree and petals drift down |
| Summer | Fireflies glow softly and float around the tree |
| Autumn | Leaves fall and pile up in the garden plot |
| Winter | Snow falls and settles on crowns, stumps and sprouts |

Anything falling or floating stops when "reduced motion" is on or when you're in the flat view. The blossoms, the fallen leaves and the caps of snow stay.

## See it all at once

Here's an example built from the real viewer components: one year, with one adopted, running, rejected and draft experiment in each season. From the top: four close-up 3D views, one per season, then the whole year as 3D islands, then the same year in the flat view. Drag to look around and scroll to zoom in.

<iframe class="season-gallery" src="/researchtree/guide/gallery/gallery.html?lang=en" title="Season gallery" loading="lazy" style="width: 100%; height: 2100px; border: 0; border-radius: 12px;"></iframe>

## Where the dates come from

| Value | Priority |
|---|---|
| Start | ① `started` in the PR body YAML → ② the branch's first commit → ③ when the PR was opened |
| Last worked on | ① `ended` in the YAML → ② the branch's last commit → ③ when the PR was merged / closed / edited |

If the last-worked-on date comes before the start, it's pulled up to the start. When you started an experiment long before the PR, or you're bringing over an older record, write the dates in the YAML.

```yaml
hypothesis: warmup을 2k step 두면 초반 발산 없이 빠르게 수렴한다
started: 2026-03-02
ended: 2026-03-20
```

`started` and `ended` take `YYYY-MM-DD` or a full ISO timestamp. Anything else is ignored.
