"""A picture of the research, small enough for a GitHub profile README.

GitHub strips scripts, iframes and canvases out of a README, so the viewer itself cannot go there.
An image can, and an SVG animation still plays, so the card is an SVG: the version timeline, how the
experiments ended, and the last one that was adopted. It is drawn from the tree alone, without a
browser, so a scheduled GitHub Action can commit it every day (docs/guide/guide/card.md).

Light and dark are separate files; a README picks between them with <picture>.
"""

from __future__ import annotations

from dataclasses import dataclass
from html import escape

from .memory.model import Research

WIDTH = 480
HEIGHT = 200


@dataclass(frozen=True)
class Theme:
    name: str
    bg: str
    card: str
    line: str
    ink: str
    muted: str
    running: str
    adopted: str
    rejected: str
    sea: str
    land: str
    sand: str


LIGHT = Theme(
    name="light",
    bg="#f7f4ee",
    card="#ffffff",
    line="#e4ded2",
    ink="#1f3b46",
    muted="#867e72",
    running="#e09f3e",
    adopted="#3d7a6b",
    rejected="#b0a89c",
    sea="#a5dddb",
    land="#a7d38b",
    sand="#efdcae",
)

DARK = Theme(
    name="dark",
    bg="#16211f",
    card="#1d2b29",
    line="#2c3d3a",
    ink="#e8efe9",
    muted="#93a49f",
    running="#e0a95c",
    adopted="#6bbfa6",
    rejected="#6f7d78",
    sea="#20403f",
    land="#4b7f5c",
    sand="#8a7c58",
)

THEMES = {"light": LIGHT, "dark": DARK}


@dataclass(frozen=True)
class CardData:
    """Everything the card shows, pulled out of the tree so drawing stays dumb."""

    title: str
    version: str
    versions: list[str]
    running: int
    adopted: int
    rejected: int
    latest: str | None
    latest_date: str | None

    @property
    def total(self) -> int:
        return self.running + self.adopted + self.rejected


def card_data(research: Research, title: str | None = None) -> CardData:
    experiments = list(research.experiments)
    by = {status: sum(1 for e in experiments if e.status == status) for status in ("running", "adopted", "rejected")}
    adopted = [e for e in experiments if e.status == "adopted"]
    last = adopted[-1] if adopted else None
    return CardData(
        title=title or research.repo.split("/")[-1],
        version=research.latest.name or research.root_branch,
        versions=[v.name or research.root_branch for v in research.versions],
        running=by["running"],
        adopted=by["adopted"],
        rejected=by["rejected"],
        latest=last.name if last else None,
        latest_date=last.ended.date().isoformat() if last else None,
    )


def _text(x: float, y: float, s: str, *, fill: str, size: float, weight: int = 400, anchor: str = "start") -> str:
    return (
        f'<text x="{x:.0f}" y="{y:.0f}" fill="{fill}" font-size="{size:.0f}" font-weight="{weight}" '
        f'text-anchor="{anchor}" font-family="Segoe UI, system-ui, -apple-system, sans-serif">{escape(s)}</text>'
    )


def _island(x: float, y: float, theme: Theme, plants: int, grow: bool) -> str:
    """A small flat island with a few plants: the research, drawn the way the viewer draws it."""
    out = [
        f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="62" ry="22" fill="{theme.sand}"/>',
        f'<ellipse cx="{x:.0f}" cy="{y - 6:.0f}" rx="54" ry="18" fill="{theme.land}"/>',
    ]
    # Plants stand in a row on the island; with `grow` they rise once, the way the viewer plays it.
    spots = min(plants, 5)
    for i in range(spots):
        px = x - 36 + i * 18
        delay = i * 0.18
        trunk = f'<rect x="{px:.0f}" y="{y - 20:.0f}" width="3" height="9" fill="#8d5e3c"/>'
        leaf = f'<circle cx="{px + 1.5:.0f}" cy="{y - 23:.0f}" r="6" fill="{theme.adopted}"/>'
        if grow:
            anim = (
                f'<animateTransform attributeName="transform" type="scale" additive="sum" '
                f'values="0 0;1 1" dur="0.5s" begin="{delay:.2f}s" fill="freeze"/>'
            )
            out.append(f'<g transform="translate({px + 1.5:.0f} {y - 11:.0f}) scale(0)" >{anim}<g transform="translate({-px - 1.5:.0f} {-y + 11:.0f})">{trunk}{leaf}</g></g>')
        else:
            out.append(trunk + leaf)
    return "".join(out)


def _bar(x: float, y: float, width: float, data: CardData, theme: Theme) -> str:
    """One bar split by how the experiments ended."""
    total = max(1, data.total)
    out = []
    at = x
    for count, color in ((data.adopted, theme.adopted), (data.running, theme.running), (data.rejected, theme.rejected)):
        if not count:
            continue
        w = width * count / total
        out.append(f'<rect x="{at:.1f}" y="{y:.0f}" width="{max(2, w):.1f}" height="8" rx="4" fill="{color}"/>')
        at += w + 2
    return "".join(out)


def render(data: CardData, theme: Theme, *, animate: bool = True) -> str:
    """The card as an SVG document."""
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{escape(data.title)}">',
        f'<rect width="{WIDTH}" height="{HEIGHT}" rx="20" fill="{theme.bg}"/>',
        f'<rect x="1" y="1" width="{WIDTH - 2}" height="{HEIGHT - 2}" rx="19" fill="none" stroke="{theme.line}"/>',
        _text(28, 42, data.title, fill=theme.ink, size=21, weight=700),
        _text(28, 64, f"research {data.version}", fill=theme.muted, size=13),
        # The sea the island sits on.
        f'<rect x="{WIDTH - 172}" y="24" width="148" height="92" rx="16" fill="{theme.sea}"/>',
        _island(WIDTH - 98, 86, theme, data.adopted or data.total, animate),
        _bar(28, 92, 240, data, theme),
        _text(28, 120, f"{data.adopted} adopted", fill=theme.adopted, size=13, weight=600),
        _text(120, 120, f"{data.running} running", fill=theme.running, size=13, weight=600),
        _text(212, 120, f"{data.rejected} rejected", fill=theme.rejected, size=13, weight=600),
    ]
    if data.latest:
        line = f"latest: {data.latest}"
        if data.latest_date:
            line += f" · {data.latest_date}"
        parts.append(_text(28, 150, line, fill=theme.ink, size=13))
    versions = " → ".join(data.versions[-4:])
    parts.append(_text(28, 174, versions, fill=theme.muted, size=12))
    parts.append("</svg>")
    return "".join(parts) + "\n"


def render_theme(research: Research, theme: str = "light", *, title: str | None = None, animate: bool = True) -> str:
    return render(card_data(research, title), THEMES.get(theme, LIGHT), animate=animate)
