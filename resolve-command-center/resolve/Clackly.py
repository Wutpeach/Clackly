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
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


DEFAULT_PORT = 49371
DEFAULT_BRIDGE_HEALTH_TIMEOUT_SECONDS = 5.0
LOG_PREFIX = "[resolve-command-center]"
WINDOWS_DEFAULT_RESOLVE_SCRIPT_API = Path(
    r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting"
)
WINDOWS_DEFAULT_RESOLVE_SCRIPT_LIB = Path(
    r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
)


def _port() -> int:
    raw_port = os.environ.get("RESOLVE_COMMAND_CENTER_PORT", str(DEFAULT_PORT))
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise RuntimeError(f"Invalid RESOLVE_COMMAND_CENTER_PORT: {raw_port}") from exc

    if port < 1 or port > 65535:
        raise RuntimeError(f"RESOLVE_COMMAND_CENTER_PORT out of range: {port}")

    return port


def _log_path() -> Path:
    configured_path = os.environ.get("RESOLVE_COMMAND_CENTER_LOG")
    if configured_path:
        return Path(configured_path).expanduser()

    appdata = os.environ.get("APPDATA")
    if appdata:
        return Path(appdata) / "Clackly" / "clackly.log"

    return Path.home() / ".clackly" / "clackly.log"


def _bridge_log_path() -> Path:
    configured_path = os.environ.get("RESOLVE_COMMAND_CENTER_BRIDGE_LOG")
    if configured_path:
        return Path(configured_path).expanduser()

    return _log_path().with_name("bridge.log")


def _log(message: str) -> None:
    line = f"{datetime.now().isoformat(timespec='seconds')} {LOG_PREFIX} {message}"
    print(line)

    try:
        path = _log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as log_file:
            log_file.write(line + "\n")
    except Exception as exc:
        print(f"{LOG_PREFIX} failed to write log: {exc}")


def _format_command(command: List[str]) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(command)
    return " ".join(shlex.quote(part) for part in command)


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default

    return value.strip().lower() in ("1", "true", "yes", "on")


def _bridge_health_timeout() -> float:
    raw_timeout = os.environ.get(
        "RESOLVE_COMMAND_CENTER_BRIDGE_HEALTH_TIMEOUT",
        str(DEFAULT_BRIDGE_HEALTH_TIMEOUT_SECONDS)
    )
    try:
        timeout = float(raw_timeout)
    except ValueError as exc:
        raise RuntimeError(
            f"Invalid RESOLVE_COMMAND_CENTER_BRIDGE_HEALTH_TIMEOUT: {raw_timeout}"
        ) from exc

    if timeout < 0:
        raise RuntimeError(
            "RESOLVE_COMMAND_CENTER_BRIDGE_HEALTH_TIMEOUT must be zero or greater"
        )

    return timeout


def _health_url() -> str:
    return f"http://127.0.0.1:{_port()}/health"


def _check_bridge_health() -> Tuple[bool, str]:
    try:
        with urllib.request.urlopen(_health_url(), timeout=0.25) as response:
            if 200 <= response.status < 300:
                return True, f"healthy HTTP {response.status}"
            return False, f"unhealthy HTTP {response.status}"
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return False, f"{type(exc).__name__}: {exc}"


def _is_bridge_running() -> bool:
    ok, _detail = _check_bridge_health()
    return ok


def _wait_for_bridge_health(timeout_seconds: float) -> bool:
    deadline = time.time() + timeout_seconds
    last_detail = "not checked"

    while True:
        ok, detail = _check_bridge_health()
        last_detail = detail
        if ok:
            _log(f"bridge health wait result: healthy ({detail})")
            return True

        if time.time() >= deadline:
            _log(
                "bridge health wait result: not healthy after "
                f"{timeout_seconds:.1f}s ({last_detail})"
            )
            return False

        time.sleep(0.2)


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


def _python_command() -> List[str]:
    configured_command = os.environ.get("RESOLVE_COMMAND_CENTER_PYTHON_CMD")
    if configured_command:
        return shlex.split(configured_command, posix=os.name != "nt")

    executable = sys.executable
    if executable:
        executable_name = Path(executable).name.lower()
        if "python" in executable_name or executable_name == "py.exe":
            return [executable]

        _log(
            "sys.executable does not look like a Python launcher "
            f"({executable}); falling back to python. Set "
            "RESOLVE_COMMAND_CENTER_PYTHON_CMD if Resolve needs a specific "
            "Python executable."
        )

    return ["python"]


def _append_pythonpath(environment: Dict[str, str], path: Path) -> None:
    path_text = str(path)
    existing = environment.get("PYTHONPATH", "")
    parts = [
        part for part in existing.split(os.pathsep)
        if part and part != path_text
    ]
    parts.insert(0, path_text)
    environment["PYTHONPATH"] = os.pathsep.join(parts)


def _windows_default_resolve_script_api() -> Optional[Path]:
    if os.name != "nt":
        return None

    module_path = WINDOWS_DEFAULT_RESOLVE_SCRIPT_API / "Modules" / "DaVinciResolveScript.py"
    if module_path.exists():
        return WINDOWS_DEFAULT_RESOLVE_SCRIPT_API

    return None


def _windows_default_resolve_script_lib() -> Optional[Path]:
    if os.name != "nt":
        return None

    if WINDOWS_DEFAULT_RESOLVE_SCRIPT_LIB.exists():
        return WINDOWS_DEFAULT_RESOLVE_SCRIPT_LIB

    return None


def _default_resolve_scripting_environment(environment: Dict[str, str]) -> Dict[str, str]:
    sources: Dict[str, str] = {}

    if environment.get("RESOLVE_SCRIPT_API"):
        sources["RESOLVE_SCRIPT_API"] = "env"
    else:
        detected_api = _windows_default_resolve_script_api()
        if detected_api:
            environment["RESOLVE_SCRIPT_API"] = str(detected_api)
            sources["RESOLVE_SCRIPT_API"] = "auto-detected"
        else:
            sources["RESOLVE_SCRIPT_API"] = "missing"

    if environment.get("RESOLVE_SCRIPT_LIB"):
        sources["RESOLVE_SCRIPT_LIB"] = "env"
    else:
        detected_lib = _windows_default_resolve_script_lib()
        if detected_lib:
            environment["RESOLVE_SCRIPT_LIB"] = str(detected_lib)
            sources["RESOLVE_SCRIPT_LIB"] = "auto-detected"
        else:
            sources["RESOLVE_SCRIPT_LIB"] = "missing"

    original_pythonpath = environment.get("PYTHONPATH")
    resolve_script_api = environment.get("RESOLVE_SCRIPT_API")
    if resolve_script_api:
        modules_path = Path(resolve_script_api) / "Modules"
        _append_pythonpath(environment, modules_path)
        if original_pythonpath:
            sources["PYTHONPATH"] = "env plus Resolve modules prepend"
        else:
            sources["PYTHONPATH"] = "derived from RESOLVE_SCRIPT_API"
    elif original_pythonpath:
        sources["PYTHONPATH"] = "env"
    else:
        sources["PYTHONPATH"] = "missing"

    return sources


def _bridge_environment(app_root: Path) -> Dict[str, str]:
    environment = os.environ.copy()
    environment["RESOLVE_COMMAND_CENTER_ROOT"] = str(app_root)
    environment["RESOLVE_COMMAND_CENTER_PORT"] = str(_port())
    environment.setdefault("PYTHONUNBUFFERED", "1")

    sources = _default_resolve_scripting_environment(environment)
    _log_resolve_scripting_environment(environment, sources)

    return environment


def _log_resolve_scripting_environment(
    environment: Dict[str, str],
    sources: Dict[str, str]
) -> None:
    keys = ["RESOLVE_SCRIPT_API", "RESOLVE_SCRIPT_LIB", "PYTHONPATH"]
    for key in keys:
        value = environment.get(key)
        if value:
            _log(f"bridge environment {key}={value} ({sources.get(key, 'unknown')})")
        else:
            _log(f"bridge environment {key}=<missing> ({sources.get(key, 'missing')})")

    if not environment.get("RESOLVE_SCRIPT_API") and not environment.get("RESOLVE_SCRIPT_LIB"):
        _log(
            "Resolve scripting environment variables are missing. The bridge "
            "cannot report healthy or run commands unless the selected Python "
            "can import DaVinciResolveScript or bmd. On "
            "standard Windows installs, Clackly checks ProgramData scripting "
            "modules and Program Files fusionscript.dll automatically."
        )


def _start_bridge_thread(app_root: Path) -> None:
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
    _log("bridge started in Resolve daemon thread for debugging")


def _start_bridge_subprocess(app_root: Path) -> None:
    server_path = app_root / "bridge" / "server.py"
    command = _python_command() + [str(server_path)]
    environment = _bridge_environment(app_root)
    show_console = _env_flag("RESOLVE_COMMAND_CENTER_SHOW_BRIDGE_CONSOLE")
    creationflags = 0

    if os.name == "nt":
        creationflags |= subprocess.CREATE_NEW_PROCESS_GROUP
        if show_console:
            creationflags |= subprocess.CREATE_NEW_CONSOLE
        else:
            creationflags |= subprocess.CREATE_NO_WINDOW

    _log(f"bridge launch command: {_format_command(command)}")
    _log(f"bridge console visible: {show_console}")

    stdout_target = None
    stderr_target = None
    log_file = None
    if not show_console:
        log_path = _bridge_log_path()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = log_path.open("a", encoding="utf-8")
        stdout_target = log_file
        stderr_target = subprocess.STDOUT
        _log(f"bridge output log: {log_path}")

    try:
        process = subprocess.Popen(
            command,
            cwd=str(app_root),
            env=environment,
            stdin=subprocess.DEVNULL,
            stdout=stdout_target,
            stderr=stderr_target,
            close_fds=True,
            creationflags=creationflags,
            start_new_session=os.name != "nt"
        )
        _log(f"bridge subprocess pid: {process.pid}")
    finally:
        if log_file is not None:
            log_file.close()


def start_bridge(app_root: Path) -> bool:
    ok, detail = _check_bridge_health()
    if ok:
        _log(f"bridge already running ({detail})")
        return True

    _log(f"bridge not running before launch ({detail})")

    bridge_mode = os.environ.get("RESOLVE_COMMAND_CENTER_BRIDGE_MODE", "subprocess").strip().lower()
    if bridge_mode == "thread":
        _start_bridge_thread(app_root)
    elif bridge_mode == "subprocess":
        _start_bridge_subprocess(app_root)
    else:
        raise RuntimeError(
            "RESOLVE_COMMAND_CENTER_BRIDGE_MODE must be 'subprocess' or 'thread'"
        )

    return _wait_for_bridge_health(_bridge_health_timeout())


def _electron_command() -> List[str]:
    configured_command = os.environ.get("RESOLVE_COMMAND_CENTER_ELECTRON_CMD")
    if configured_command:
        return shlex.split(configured_command, posix=os.name != "nt")

    npm_command = "npm.cmd" if os.name == "nt" else "npm"
    return [npm_command, "run", "start"]


def launch_electron(app_root: Path) -> None:
    if os.environ.get("RESOLVE_COMMAND_CENTER_DISABLE_ELECTRON") == "1":
        _log("electron launch disabled")
        return

    environment = os.environ.copy()
    environment.setdefault("RESOLVE_COMMAND_CENTER_PORT", str(_port()))

    command = _electron_command()
    _log(f"electron launch command: {_format_command(command)}")

    subprocess.Popen(
        command,
        cwd=str(app_root),
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True
    )


def main() -> None:
    _log(f"Clackly launcher starting; log path: {_log_path()}")
    app_root = find_app_root()
    _log(f"app root: {app_root}")
    bridge_healthy = start_bridge(app_root)
    if not bridge_healthy:
        _log("launching Electron even though bridge health check failed")
    launch_electron(app_root)


try:
    main()
except Exception as exc:
    _log(f"startup failed: {type(exc).__name__}: {exc}")
    raise
