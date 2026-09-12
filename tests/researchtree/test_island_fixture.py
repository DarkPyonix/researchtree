"""The island map rules, shared with TypeScript (apps/core/src/island.ts).

Both ports must turn island-cases.json into island-expected.json. Regenerate the expected file from
the TypeScript side with `RT_UPDATE_FIXTURES=1 npm test`, then make this pass.
"""

from __future__ import annotations

import json
from pathlib import Path

from researchtree.island import parse_map

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def _as_json(text: str) -> dict:
    m = parse_map(text)
    return {
        "islands": [
            {
                "name": land.name,
                "at": list(land.at),
                **({"intro": land.intro} if land.intro else {}),
                "repos": [{"repo": r.repo, "at": list(r.at), "root": r.root, "prefix": r.prefix} for r in land.repos],
            }
            for land in m.islands
        ],
        "warnings": m.warnings,
    }


def test_matches_the_typescript_port():
    cases = json.loads((FIXTURES / "island-cases.json").read_text(encoding="utf-8"))
    expected = json.loads((FIXTURES / "island-expected.json").read_text(encoding="utf-8"))
    got = {"maps": [{"name": c["name"], **_as_json(c["text"])} for c in cases["maps"]]}
    assert got == expected
