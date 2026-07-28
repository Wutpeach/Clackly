"""
User-facing DaVinci Resolve Utility entrypoint for Clackly.

Install this file as Clackly.py in Resolve's Utility scripts directory. It
locates and runs the existing startup.py implementation so startup behavior has
one owner.
"""

import os
import runpy
from pathlib import Path
from typing import List


def _candidate_startup_paths() -> List[Path]:
    paths = []

    configured_root = os.environ.get("RESOLVE_COMMAND_CENTER_ROOT")
    if configured_root:
        paths.append(Path(configured_root) / "resolve" / "startup.py")

    script_path = Path(__file__).resolve()
    paths.extend([
        script_path.with_name("startup.py"),
        script_path.parent.parent / "resolve" / "startup.py"
    ])
    return paths


def find_startup_script() -> Path:
    for path in _candidate_startup_paths():
        if path.exists():
            return path

    candidates = ", ".join(str(path) for path in _candidate_startup_paths())
    raise RuntimeError(
        "Could not locate Clackly startup implementation. "
        "Set RESOLVE_COMMAND_CENTER_ROOT to the resolve-command-center app "
        f"directory. Checked: {candidates}"
    )


def main() -> None:
    runpy.run_path(str(find_startup_script()), run_name="__main__")


main()
