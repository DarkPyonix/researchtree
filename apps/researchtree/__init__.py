"""ResearchTree: record experiments as a tree of Git branches and pull requests, and read it back as code."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("researchtree")
except PackageNotFoundError:  # running from a source tree without installing
    __version__ = "0.0.0"

from .experiment.tracking import conclude, log, set  # noqa: E402, A004
from .memory import from_data, load  # noqa: E402

__all__ = ["__version__", "log", "set", "conclude", "load", "from_data"]
