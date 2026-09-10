"""ResearchTree: record and view experiments as a tree of Git branches and pull requests."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("researchtree")
except PackageNotFoundError:  # running from a source tree without installing
    __version__ = "0.0.0"

from .experiment.tracking import conclude, log, set  # noqa: E402, A004

__all__ = ["__version__", "log", "set", "conclude"]
