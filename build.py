"""Hatch build hook: make sure the viewer bundle exists before building a wheel.

Release builds (and PyPI sdists) already contain `researchtree/server/static/`, so this is a no-op there.
When installing straight from a git checkout, static/ is missing because it is gitignored; if
Node.js is available we build it, otherwise the wheel is built without it. The training-script API
(`rt.log` etc.) works either way; only `researchtree serve` needs the viewer.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface

WORKSPACE = "@researchtree/ui"


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version: str, build_data: dict) -> None:
        if version == "editable" or os.environ.get("RESEARCHTREE_SKIP_WEBVIEW"):
            return
        root = Path(self.root)
        if (root / "apps/researchtree/server/static/index.html").exists():
            return

        npm = shutil.which("npm")
        if npm is None or not (root / "package.json").exists():
            self.app.display_warning(
                "researchtree: viewer bundle not found and npm is unavailable; "
                "`researchtree serve` will show build instructions instead of the viewer."
            )
            return

        self.app.display_info("researchtree: building the viewer bundle with npm")
        if not (root / "node_modules").exists():
            subprocess.run([npm, "ci", "-w", WORKSPACE, "--no-audit", "--no-fund"], cwd=root, check=True)
        subprocess.run([npm, "run", "build:local", "-w", WORKSPACE], cwd=root, check=True)
