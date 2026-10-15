"""One-shot official ResolvePython transport for ordinary Workspace scripts."""

import importlib
import json
import os
import stat
import sys
from pathlib import Path


LANGUAGES = {".py": "python", ".lua": "lua"}
MAX_REQUEST_BYTES = 64 * 1024


def canonical(path):
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


def script_id(path):
    return "resolve-workspace-script:" + canonical(path).replace("\\", "/")


def is_reparse(path):
    try:
        metadata = os.lstat(path)
    except OSError:
        return True
    attributes = getattr(metadata, "st_file_attributes", 0)
    return stat.S_ISLNK(metadata.st_mode) or bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def is_contained(child, root):
    try:
        return os.path.commonpath((canonical(child), canonical(root))) == canonical(root)
    except ValueError:
        return False


def official_roots(environment=os.environ):
    program_data = environment.get("PROGRAMDATA", r"C:\ProgramData")
    app_data = environment.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
    base = Path("Blackmagic Design") / "DaVinci Resolve"
    return [
        ("system", Path(program_data) / base / "Fusion" / "Scripts"),
        ("user", Path(app_data) / base / "Support" / "Fusion" / "Scripts")
    ]


def diagnostic(code, path, error=None):
    value = {"code": code, "path": str(path)}
    if error:
        value["message"] = f"{type(error).__name__}: {error}"
    return value


def walk(root, diagnostics):
    if not root.exists():
        return
    if not root.is_dir() or is_reparse(root):
        diagnostics.append(diagnostic("root_rejected", root))
        return
    pending = [root]
    while pending:
        directory = pending.pop()
        try:
            with os.scandir(directory) as scan:
                entries = sorted(scan, key=lambda item: (item.name.casefold(), item.name))
        except OSError as error:
            diagnostics.append(diagnostic("directory_unreadable", directory, error))
            continue
        for entry in entries:
            try:
                if is_reparse(entry.path):
                    continue
                if entry.is_dir(follow_symlinks=False):
                    pending.append(Path(entry.path))
                elif entry.is_file(follow_symlinks=False):
                    yield Path(entry.path)
            except OSError as error:
                diagnostics.append(diagnostic("entry_unreadable", entry.path, error))


def discover(roots=None):
    scripts, diagnostics, seen = [], [], set()
    for source, root in roots or official_roots():
        root = Path(root)
        for candidate in walk(root, diagnostics) or ():
            language = LANGUAGES.get(candidate.suffix.casefold())
            if not language or not is_contained(candidate, root):
                continue
            identity = script_id(candidate)
            if identity in seen:
                diagnostics.append(diagnostic("duplicate_path", candidate))
                continue
            seen.add(identity)
            relative = candidate.relative_to(root)
            folders = relative.parts[:-1]
            scripts.append({
                "id": identity,
                "name": candidate.stem,
                "absolutePath": str(candidate.absolute()),
                "language": language,
                "source": source,
                "category": folders[0] if folders else None,
                "nesting": list(folders[1:]) if folders else []
            })
    scripts.sort(key=lambda item: (item["source"], item["absolutePath"].casefold(), item["absolutePath"]))
    return {"scripts": scripts, "diagnostics": diagnostics}


def validated_selection(script_id_value, absolute_path, roots):
    if not isinstance(script_id_value, str) or not isinstance(absolute_path, str):
        return None
    candidate = Path(absolute_path)
    if not candidate.is_absolute() or is_reparse(candidate):
        return None
    try:
        is_regular = candidate.is_file()
    except OSError:
        return None
    if not is_regular or candidate.suffix.casefold() not in LANGUAGES or script_id(candidate) != script_id_value:
        return None
    for _source, root in roots:
        root = Path(root)
        if root.exists() and root.is_dir() and not is_reparse(root) and is_contained(candidate, root):
            return {"absolutePath": str(candidate.absolute()), "language": LANGUAGES[candidate.suffix.casefold()]}
    return None


def resolve_module():
    module_directory = os.environ.get("CLACKLY_RESOLVE_SCRIPT_MODULES")
    if module_directory and os.path.isdir(module_directory) and module_directory not in sys.path:
        sys.path.insert(0, module_directory)
    return importlib.import_module("DaVinciResolveScript")


def error_details(error):
    return {"type": type(error).__name__, "message": str(error)}


def invoke(request, roots=None, dvr_module=None):
    request_id = request.get("requestId") if isinstance(request, dict) else None
    receipt = {"operation": "invoke", "requestId": request_id}
    roots = roots or official_roots()
    selection = validated_selection(request.get("scriptId"), request.get("absolutePath"), roots)
    if not selection:
        return {**receipt, "status": "not_submitted", "reason": "validation_rejected"}
    try:
        module = dvr_module or resolve_module()
        resolve = module.scriptapp("Resolve")
        fusion = resolve.Fusion() if resolve else None
        run_script = getattr(fusion, "RunScript", None)
        if not callable(run_script):
            return {**receipt, "status": "not_submitted", "reason": "host_unavailable"}
        variables = {}
        if selection["language"] == "python":
            manager = resolve.GetProjectManager()
            project = manager.GetCurrentProject() if manager else None
            if project is not None:
                variables["project"] = project
    except BaseException as error:
        return {**receipt, "status": "not_submitted", "reason": "host_unavailable", "error": error_details(error)}
    try:
        result = run_script(selection["absolutePath"], variables)
    except BaseException as error:
        return {**receipt, "status": "submission_unknown", "reason": "api_exception", "error": error_details(error)}
    return {**receipt, "status": "api_returned", "apiReturn": result}


def handle(request):
    if not isinstance(request, dict) or not isinstance(request.get("requestId"), str):
        return {"status": "not_submitted", "reason": "request_invalid"}
    if request.get("operation") == "discover":
        snapshot = discover()
        return {"operation": "discover", "requestId": request["requestId"], "status": "discovered", **snapshot}
    if request.get("operation") == "invoke":
        return invoke(request)
    return {"operation": request.get("operation"), "requestId": request["requestId"], "status": "not_submitted", "reason": "request_invalid"}


def main():
    raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        response = {"status": "not_submitted", "reason": "request_too_large"}
    else:
        try:
            response = handle(json.loads(raw.decode("utf-8")))
        except (UnicodeDecodeError, json.JSONDecodeError):
            response = {"status": "not_submitted", "reason": "request_invalid"}
    print(json.dumps(response, default=str, separators=(",", ":")))


if __name__ == "__main__":
    main()
