"""
DaVinci Resolve Utility entrypoint for Clackly.

Install this file as Clackly.py in Resolve's Utility scripts directory.

Windows user Utility script target:
%APPDATA%\\Blackmagic Design\\DaVinci Resolve\\Support\\Fusion\\Scripts\\Utility\\Clackly.py

Set RESOLVE_COMMAND_CENTER_ROOT to the resolve-command-center app directory
before starting Resolve when using Resolve's Utility script runner. Resolve may
execute Utility scripts without defining __file__, including symlinked scripts.
"""

import os
import shlex
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Optional


DEFAULT_PORT = 49371


def _port() -> int:
    raw_port = os.environ.get("RESOLVE_COMMAND_CENTER_PORT", str(DEFAULT_PORT))
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise RuntimeError(f"Invalid RESOLVE_COMMAND_CENTER_PORT: {raw_port}") from exc

    if port < 1 or port > 65535:
        raise RuntimeError(f"RESOLVE_COMMAND_CENTER_PORT out of range: {port}")

    return port


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
        roots.append(Path(configured_root).expanduser())

    script_path = _script_path()
    if script_path:
        roots.extend([
            script_path.parent.parent,
            script_path.parent
        ])
    else:
        try:
            cwd = Path.cwd()
        except OSError:
            cwd = None
        if cwd:
            roots.extend([
                cwd,
                cwd / "resolve-command-center"
            ])
    return roots


def _script_path() -> Optional[Path]:
    runtime_file = globals().get("__file__")
    if not runtime_file:
        return None
    return Path(runtime_file).resolve()


def find_app_root() -> Path:
    roots = _candidate_roots()
    for root in roots:
        package_json = root / "package.json"
        bridge_server = root / "bridge" / "server.py"
        if package_json.exists() and bridge_server.exists():
            return root

    candidates = ", ".join(str(root) for root in roots) or "<none>"
    if _script_path() is None:
        raise RuntimeError(
            "Could not locate resolve-command-center app root. Resolve did not "
            "provide __file__, so Clackly.py could not infer the app root from "
            "the Utility script location. Set RESOLVE_COMMAND_CENTER_ROOT to "
            "the resolve-command-center app root before launching Resolve. "
            f"Checked: {candidates}"
        )

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
