import asyncio
import contextlib
import importlib.util
import inspect
import io
import json
import pathlib
import sys
from typing import Any

APP_ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from resolve import adapter as resolve_adapter  # noqa: E402


class ScriptLogger:
    def __init__(self, logs: list[dict[str, str]]) -> None:
        self._logs = logs

    def _write(self, level: str, *values: Any) -> None:
        self._logs.append({"level": level, "message": " ".join(map(str, values))})

    def debug(self, *values: Any) -> None:
        self._write("debug", *values)

    def info(self, *values: Any) -> None:
        self._write("info", *values)

    def warning(self, *values: Any) -> None:
        self._write("warning", *values)

    def error(self, *values: Any) -> None:
        self._write("error", *values)


class ScriptContext:
    def __init__(self, command_id: str, config: dict[str, Any], logger: ScriptLogger, adapter: Any) -> None:
        self._command_id = command_id
        self.config = dict(config)
        self.logger = logger
        self._adapter = adapter
        self._resolve = None
        self._project_timeline = None

    @property
    def command_id(self) -> str:
        return self._command_id

    @property
    def resolve(self) -> Any:
        if self._resolve is None:
            self._resolve = self._adapter.get_resolve()
        return self._resolve

    def _get_project_timeline(self) -> tuple[Any, Any]:
        if self._project_timeline is None:
            self._project_timeline = self._adapter.get_project_and_timeline()
        return self._project_timeline

    @property
    def project(self) -> Any:
        return self._get_project_timeline()[0]

    @property
    def timeline(self) -> Any:
        return self._get_project_timeline()[1]


def _load_execute(entry_path: pathlib.Path):
    spec = importlib.util.spec_from_file_location("clackly_feature", entry_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Could not load script: {entry_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    execute = getattr(module, "execute", None)
    if not callable(execute):
        raise TypeError("Script must export a callable execute(context)")
    return execute


def _capture_stream(logs: list[dict[str, str]], level: str, stream: io.StringIO) -> None:
    logs.extend(
        {"level": level, "message": line}
        for line in stream.getvalue().splitlines()
        if line
    )


def run_script(
    entry_path: str,
    command_id: str,
    config: dict[str, Any],
    adapter: Any = resolve_adapter,
) -> dict[str, Any]:
    logs: list[dict[str, str]] = []
    stdout = io.StringIO()
    stderr = io.StringIO()
    try:
        if not isinstance(command_id, str) or not command_id.strip():
            raise TypeError("Script Command id must be a non-empty string")
        context = ScriptContext(command_id, config, ScriptLogger(logs), adapter)
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = _load_execute(pathlib.Path(entry_path))(context)
            if inspect.isawaitable(result):
                result = asyncio.run(result)
        json.dumps(result, allow_nan=False)
        envelope = {"ok": True, "result": result, "logs": logs}
    except Exception as error:
        envelope = {
            "ok": False,
            "error": {"type": type(error).__name__, "message": str(error)},
            "logs": logs,
        }
    finally:
        _capture_stream(logs, "info", stdout)
        _capture_stream(logs, "error", stderr)
    return envelope


def main() -> None:
    try:
        request = json.load(sys.stdin)
        if not isinstance(request, dict):
            raise TypeError("Script request must be an object")
        command_id = request.get("commandId")
        if not isinstance(command_id, str) or not command_id.strip():
            raise TypeError("Script Command id must be a non-empty string")
        config = request.get("config", {})
        if not isinstance(config, dict):
            raise TypeError("Script configuration must be an object")
        envelope = run_script(sys.argv[1], command_id, config)
    except Exception as error:
        envelope = {
            "ok": False,
            "error": {"type": type(error).__name__, "message": str(error)},
            "logs": [],
        }
    sys.__stdout__.write(json.dumps(envelope, allow_nan=False))


if __name__ == "__main__":
    main()
