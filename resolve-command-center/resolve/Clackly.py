"""
DaVinci Resolve Utility entrypoint for Clackly.

Install this file as Clackly.py in Resolve's Utility scripts directory.

Windows user Utility script target:
%APPDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Utility\\Clackly.py

If Clackly.py is copied outside the source tree, set RESOLVE_COMMAND_CENTER_ROOT
to the resolve-command-center app directory before starting Resolve.
"""

import os
import shlex
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import List


DEFAULT_PORT = 49371


def _port() -> int:
    return int(os.environ.get("RESOLVE_COMMAND_CENTER_PORT", str(DEFAULT_PORT)))


def _health_url() -> str:
    return f"http://127.0.0.1:{_port()}/health"


def _is_bridge_running() -> bool:
    try:
        with urllib.request.urlopen(_health_url(), timeout=0.25) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError):
        return False


def _candidate_roots() -> List[Path]:
    roots = []
    configured_root = os.environ.get("RESOLVE_COMMAND_CENTER_ROOT")
    if configured_root:
        roots.append(Path(configured_root))

    script_path = Path(__file__).resolve()
    roots.extend([
        script_path.parent.parent,
        script_path.parent
    ])
    return roots


def find_app_root() -> Path:
    for root in _candidate_roots():
        package_json = root / "package.json"
        bridge_server = root / "bridge" / "server.py"
        if package_json.exists() and bridge_server.exists():
            return root

    candidates = ", ".join(str(root) for root in _candidate_roots())
    raise RuntimeError(
        "Could not locate resolve-command-center app root. "
        "Set RESOLVE_COMMAND_CENTER_ROOT. Checked: "
        f"{candidates}"
    )


def start_bridge(app_root: Path) -> None:
    if _is_bridge_running():
        print("[resolve-command-center] bridge already running")
        return

    bridge_dir = app_root / "bridge"
    sys.path.insert(0, str(bridge_dir))

    from server import run_server

    thread = threading.Thread(
        target=run_server,
        kwargs={"port": _port()},
        name="resolve-command-center-bridge",
        daemon=True
    )
    thread.start()


def _electron_command() -> List[str]:
    configured_command = os.environ.get("RESOLVE_COMMAND_CENTER_ELECTRON_CMD")
    if configured_command:
        return shlex.split(configured_command, posix=os.name != "nt")

    npm_command = "npm.cmd" if os.name == "nt" else "npm"
    return [npm_command, "run", "start"]


def launch_electron(app_root: Path) -> None:
    if os.environ.get("RESOLVE_COMMAND_CENTER_DISABLE_ELECTRON") == "1":
        print("[resolve-command-center] electron launch disabled")
        return

    environment = os.environ.copy()
    environment.setdefault("RESOLVE_COMMAND_CENTER_PORT", str(_port()))

    subprocess.Popen(
        _electron_command(),
        cwd=str(app_root),
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True
    )


def main() -> None:
    app_root = find_app_root()
    start_bridge(app_root)
    launch_electron(app_root)


main()
