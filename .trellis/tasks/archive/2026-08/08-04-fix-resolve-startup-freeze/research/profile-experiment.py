"""Transactional profile moves for the Resolve startup-freeze experiment.

This task-local tool never copies, deletes, or overwrites a profile directory.
Resolve lifecycle remains user-controlled; process checks are observation-only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import struct
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any


CANONICAL = Path(os.environ["APPDATA"]) / "Clackly Workflow Plugin"
STATE = Path(f"{CANONICAL}.trellis-round3-state.json")
EXPECTED_MAIN_HASH = "438F9A2D31FF26B7C9DA46CC5688D054AABE2A27284930BF979C1B5428D92F67"
PLUGIN_MAIN = (
    Path(os.environ["PROGRAMDATA"])
    / "Blackmagic Design"
    / "DaVinci Resolve"
    / "Support"
    / "Workflow Integration Plugins"
    / "com.wutpeach.clackly"
    / "workflow-plugin"
    / "main.js"
)
REPARSE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


class SafetyError(RuntimeError):
    pass


def normalized(path: Path) -> Path:
    return Path(os.path.abspath(os.path.normpath(path)))


def path_exists(path: Path) -> bool:
    return os.path.lexists(path)


def lstat_safe(path: Path) -> os.stat_result:
    return os.stat(path, follow_symlinks=False)


def is_reparse(info: os.stat_result) -> bool:
    return bool(getattr(info, "st_file_attributes", 0) & REPARSE)


def assert_no_reparse_ancestors(path: Path) -> None:
    path = normalized(path)
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        if not path_exists(current):
            continue
        info = lstat_safe(current)
        if is_reparse(info):
            raise SafetyError(f"Reparse points are not allowed in an experiment path: {current}")


def path_identity(path: Path) -> dict[str, int]:
    info = lstat_safe(path)
    if is_reparse(info):
        raise SafetyError(f"Reparse point is not allowed: {path}")
    return {"volume": int(info.st_dev), "file": int(info.st_ino)}


def same_identity(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return int(left["volume"]) == int(right["volume"]) and int(left["file"]) == int(right["file"])


def sha256_file(path: Path) -> tuple[bytes, os.stat_result]:
    before = lstat_safe(path)
    if is_reparse(before) or not stat.S_ISREG(before.st_mode):
        raise SafetyError("Profile traversal encountered an unsupported entry.")
    digest = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            opened = os.fstat(stream.fileno())
            if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
                raise SafetyError("Profile entry changed while it was opened.")
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
            after_handle = os.fstat(stream.fileno())
    except SafetyError:
        raise
    except OSError as exc:
        raise SafetyError("A profile entry could not be read safely.") from exc
    after_path = lstat_safe(path)
    before_key = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
    if before_key != (after_handle.st_dev, after_handle.st_ino, after_handle.st_size, after_handle.st_mtime_ns):
        raise SafetyError("Profile entry changed while it was hashed.")
    if before_key != (after_path.st_dev, after_path.st_ino, after_path.st_size, after_path.st_mtime_ns):
        raise SafetyError("Profile entry changed after it was hashed.")
    if is_reparse(after_path):
        raise SafetyError("Profile entry became a reparse point during traversal.")
    return digest.digest(), after_path


def tree_digest(root: Path) -> dict[str, Any]:
    root = normalized(root)
    root_info = lstat_safe(root)
    if is_reparse(root_info) or not stat.S_ISDIR(root_info.st_mode):
        raise SafetyError(f"Expected a real profile directory: {root}")

    queue = [root]
    records: list[tuple[str, bytes]] = []
    file_count = 0
    directory_count = 0
    total_bytes = 0
    try:
        while queue:
            parent = queue.pop(0)
            parent_info = lstat_safe(parent)
            if is_reparse(parent_info) or not stat.S_ISDIR(parent_info.st_mode):
                raise SafetyError("Queued profile directory changed before traversal.")
            with os.scandir(parent) as entries:
                for entry in entries:
                    entry_path = Path(entry.path)
                    info = entry.stat(follow_symlinks=False)
                    if is_reparse(info):
                        raise SafetyError("Profile contains a reparse entry; traversal stopped without following it.")
                    relative = entry_path.relative_to(root).as_posix()
                    path_bytes = relative.encode("utf-8")
                    if stat.S_ISDIR(info.st_mode):
                        queue.append(entry_path)
                        directory_count += 1
                        payload = struct.pack("<I", len(path_bytes)) + path_bytes + b"D" + struct.pack("<qI", 0, 0)
                    elif stat.S_ISREG(info.st_mode):
                        file_hash, verified = sha256_file(entry_path)
                        file_count += 1
                        total_bytes += int(verified.st_size)
                        payload = (
                            struct.pack("<I", len(path_bytes))
                            + path_bytes
                            + b"F"
                            + struct.pack("<qI", int(verified.st_size), len(file_hash))
                            + file_hash
                        )
                    else:
                        raise SafetyError("Profile contains an unsupported filesystem entry.")
                    records.append((relative, payload))
    except SafetyError:
        raise
    except OSError as exc:
        raise SafetyError("Profile traversal failed without disclosing the internal entry name.") from exc

    root_hash = hashlib.sha256()
    for _, payload in sorted(records, key=lambda item: item[0]):
        root_hash.update(payload)
    return {
        "sha256": root_hash.hexdigest().upper(),
        "files": file_count,
        "directories": directory_count,
        "bytes": total_bytes,
    }


def durable_write_json(path: Path, value: dict[str, Any], *, initial: bool = False) -> None:
    path = normalized(path)
    assert_no_reparse_ancestors(path.parent)
    if initial and path_exists(path):
        raise SafetyError(f"State destination already exists: {path}")
    payload = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")
    temporary = path.with_name(f"{path.name}.tmp-{uuid.uuid4().hex}")
    try:
        with temporary.open("xb", buffering=0) as stream:
            stream.write(payload)
            os.fsync(stream.fileno())
        if initial:
            os.rename(temporary, path)
        else:
            os.replace(temporary, path)
        with path.open("r+b", buffering=0) as stream:
            os.fsync(stream.fileno())
            read_back = stream.read()
        if read_back != payload or json.loads(read_back) != value:
            raise SafetyError("Durable state read-back verification failed.")
    finally:
        if path_exists(temporary):
            temporary.unlink()


def load_state(state_path: Path) -> dict[str, Any]:
    try:
        with normalized(state_path).open("rb") as stream:
            raw = stream.read()
        state = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise SafetyError(f"State is missing or corrupt; no profile move is allowed: {state_path}") from exc
    required = {"schema", "canonical", "originalBackup", "profile1", "profile2", "abortProfile", "phase", "pending", "original"}
    if state.get("schema") != 1 or not required.issubset(state):
        raise SafetyError(f"State schema is invalid; no profile move is allowed: {state_path}")
    return state


def save_state(state_path: Path, state: dict[str, Any]) -> None:
    state["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    durable_write_json(state_path, state)


def observed_profile_processes() -> list[dict[str, Any]]:
    command = r"""
$items = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessId -notin @(__SELF_PID__, __PARENT_PID__) -and (
    $_.Name -eq 'Resolve.exe' -or
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -match 'DaVinci Resolve\\Electron|Clackly|resolve-command-center|com\.wutpeach') -or
    (($_.Name -match '^(node|npm|python|pythonw|fuscript)\.exe$') -and $_.CommandLine -match 'Clackly|resolve-command-center|com\.wutpeach')
  )
} | Select-Object Name, ProcessId)
ConvertTo-Json -Compress -InputObject $items
""".replace("__SELF_PID__", str(os.getpid())).replace("__PARENT_PID__", str(os.getppid()))
    completed = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
        check=True,
        capture_output=True,
        text=True,
    )
    parsed = json.loads(completed.stdout or "[]")
    if isinstance(parsed, dict):
        return [parsed]
    return parsed


def require_processes_absent() -> None:
    processes = observed_profile_processes()
    if processes:
        summary = ", ".join(f"{item['Name']} PID={item['ProcessId']}" for item in processes)
        raise SafetyError(f"Resolve/Clackly processes are still running. Close them normally; no process was terminated: {summary}")


def expected_identity(path: Path, digest: dict[str, Any] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"directory": path_identity(path)}
    if digest is not None:
        result["tree"] = digest
    return result


def verify_identity(path: Path, expected: dict[str, Any]) -> None:
    if not same_identity(path_identity(path), expected["directory"]):
        raise SafetyError(f"Directory identity mismatch at top-level path: {path}")
    if "tree" in expected and tree_digest(path) != expected["tree"]:
        raise SafetyError(f"Tree digest mismatch at top-level path: {path}")


def begin_pending(
    state_path: Path,
    state: dict[str, Any],
    source: Path,
    target: Path,
    expected: dict[str, Any],
    after_phase: str,
) -> None:
    if state["pending"] is not None:
        raise SafetyError("A pending operation must be reconciled before another move.")
    state["pending"] = {
        "source": str(normalized(source)),
        "target": str(normalized(target)),
        "expectedIdentity": expected,
        "beforePhase": state["phase"],
        "afterPhase": after_phase,
    }
    save_state(state_path, state)


def reconcile_pending(state_path: Path, state: dict[str, Any]) -> str:
    pending = state["pending"]
    if pending is None:
        return "none"
    source = Path(pending["source"])
    target = Path(pending["target"])
    source_exists = path_exists(source)
    target_exists = path_exists(target)
    if source_exists and not target_exists:
        verify_identity(source, pending["expectedIdentity"])
        state["phase"] = pending["beforePhase"]
        state["pending"] = None
        save_state(state_path, state)
        return "not-applied"
    if not source_exists and target_exists:
        verify_identity(target, pending["expectedIdentity"])
        state["phase"] = pending["afterPhase"]
        state["pending"] = None
        save_state(state_path, state)
        return "applied"
    raise SafetyError("Pending move is ambiguous (both/neither path exists or identity mismatches); no mutation was performed.")


def transactional_move(
    state_path: Path,
    state: dict[str, Any],
    source: Path,
    target: Path,
    expected: dict[str, Any],
    after_phase: str,
    *,
    observe_processes: bool = True,
) -> None:
    source = normalized(source)
    target = normalized(target)
    assert_no_reparse_ancestors(source)
    assert_no_reparse_ancestors(target.parent)
    if not path_exists(source) or not stat.S_ISDIR(lstat_safe(source).st_mode) or path_exists(target):
        raise SafetyError(f"Rename precondition failed for top-level paths: {source} -> {target}")
    verify_identity(source, expected)
    if path_identity(source)["volume"] != path_identity(target.parent)["volume"]:
        raise SafetyError("Cross-volume profile moves are prohibited.")
    begin_pending(state_path, state, source, target, expected, after_phase)
    if observe_processes:
        require_processes_absent()
    try:
        os.rename(source, target)
    except OSError as exc:
        raise SafetyError(
            "Profile rename failed; the durable pending operation was retained for fail-closed recovery."
        ) from exc
    if path_exists(source) or not path_exists(target):
        raise SafetyError("Rename verification failed; consult the durable pending operation before recovery.")
    verify_identity(target, expected)
    state["phase"] = after_phase
    state["pending"] = None
    save_state(state_path, state)


def require_original_plugin() -> None:
    if not PLUGIN_MAIN.is_file():
        raise SafetyError(f"Installed original plugin entrypoint was not found: {PLUGIN_MAIN}")
    actual = hashlib.sha256(PLUGIN_MAIN.read_bytes()).hexdigest().upper()
    if actual != EXPECTED_MAIN_HASH:
        raise SafetyError(f"Installed plugin is not the approved original (main.js SHA-256 {actual}).")


def assert_prepare_slot(canonical: Path, state_path: Path) -> None:
    if path_exists(state_path):
        raise SafetyError(
            f"An experiment journal already exists. Reconcile it with status/restore; never remove it manually: {state_path}"
        )
    orphaned_originals = list(canonical.parent.glob(f"{canonical.name}.trellis-original-*"))
    if orphaned_originals:
        rendered = ", ".join(str(path) for path in orphaned_originals)
        raise SafetyError(
            f"Immutable original backup exists outside the journal; manual reconciliation is required: {rendered}"
        )


def make_state(canonical: Path) -> dict[str, Any]:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    parent = canonical.parent
    allocated = {
        "originalBackup": parent / f"{canonical.name}.trellis-original-{stamp}",
        "profile1": parent / f"{canonical.name}.trellis-c1w1-{stamp}",
        "profile2": parent / f"{canonical.name}.trellis-c2-{stamp}",
        "abortProfile": parent / f"{canonical.name}.trellis-abort-{stamp}",
    }
    for path in allocated.values():
        if path_exists(path):
            raise SafetyError(f"Allocated destination already exists: {path}")
        assert_no_reparse_ancestors(path.parent)
    canonical_id = path_identity(canonical)
    parent_id = path_identity(parent)
    if canonical_id["volume"] != parent_id["volume"]:
        raise SafetyError("Canonical profile and sibling backup parent do not share a volume identity.")
    digest = tree_digest(canonical)
    return {
        "schema": 1,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "canonical": str(canonical),
        **{key: str(value) for key, value in allocated.items()},
        "volumeIdentity": canonical_id["volume"],
        "phase": "before-original-backup",
        "pending": None,
        "original": {"directory": canonical_id, "tree": digest},
    }


def action_prepare(state_path: Path) -> None:
    require_processes_absent()
    require_original_plugin()
    canonical = normalized(CANONICAL)
    assert_no_reparse_ancestors(canonical)
    assert_prepare_slot(canonical, state_path)
    if not path_exists(canonical) or not stat.S_ISDIR(lstat_safe(canonical).st_mode):
        raise SafetyError(f"Canonical profile was not found: {canonical}")
    state = make_state(canonical)
    durable_write_json(state_path, state, initial=True)
    transactional_move(
        state_path,
        state,
        canonical,
        Path(state["originalBackup"]),
        state["original"],
        "original-backed-up",
    )
    print(json.dumps({
        "phase": state["phase"],
        "canonical": state["canonical"],
        "originalBackup": state["originalBackup"],
        "profile1": state["profile1"],
        "profile2": state["profile2"],
        "originalTree": state["original"]["tree"],
    }, indent=2))


def action_mark_c1(state_path: Path) -> None:
    require_processes_absent()
    state = load_state(state_path)
    reconcile_pending(state_path, state)
    if state["phase"] != "original-backed-up":
        raise SafetyError(f"C1 completion is not valid in phase {state['phase']!r}.")
    canonical = Path(state["canonical"])
    if not path_exists(canonical) or not stat.S_ISDIR(lstat_safe(canonical).st_mode):
        raise SafetyError("C1 did not create the canonical profile directory.")
    identity = path_identity(canonical)
    if int(identity["volume"]) != int(state["volumeIdentity"]):
        raise SafetyError("C1 profile is not on the recorded volume.")
    state["profile1Identity"] = identity
    state["phase"] = "c1-complete"
    save_state(state_path, state)
    print(json.dumps({"phase": state["phase"], "canonicalIdentity": identity}, indent=2))


def action_retain_warm(state_path: Path) -> None:
    require_processes_absent()
    state = load_state(state_path)
    reconcile_pending(state_path, state)
    if state["phase"] != "c1-complete":
        raise SafetyError(f"Warm-profile retention is not valid in phase {state['phase']!r}.")
    canonical = Path(state["canonical"])
    if not path_exists(canonical) or not stat.S_ISDIR(lstat_safe(canonical).st_mode):
        raise SafetyError("The exact C1/W1 canonical profile directory is missing.")
    identity = path_identity(canonical)
    if not same_identity(identity, state["profile1Identity"]):
        raise SafetyError("The profile used by W1 is not the exact C1 directory identity.")
    digest = tree_digest(canonical)
    expected = expected_identity(canonical, digest)
    state["profile1Tree"] = digest
    save_state(state_path, state)
    transactional_move(state_path, state, canonical, Path(state["profile1"]), expected, "warm-retained")
    print(json.dumps({"phase": state["phase"], "retainedProfile": state["profile1"], "tree": digest}, indent=2))


def action_retain_c2(state_path: Path) -> None:
    require_processes_absent()
    state = load_state(state_path)
    reconcile_pending(state_path, state)
    if state["phase"] != "warm-retained":
        raise SafetyError(f"C2 retention is not valid in phase {state['phase']!r}.")
    canonical = Path(state["canonical"])
    if not path_exists(canonical) or not stat.S_ISDIR(lstat_safe(canonical).st_mode):
        raise SafetyError("C2 did not create the canonical profile directory.")
    digest = tree_digest(canonical)
    expected = expected_identity(canonical, digest)
    state["profile2Tree"] = digest
    save_state(state_path, state)
    transactional_move(state_path, state, canonical, Path(state["profile2"]), expected, "c2-retained")
    print(json.dumps({"phase": state["phase"], "retainedProfile": state["profile2"], "tree": digest}, indent=2))


def select_abort_target(state: dict[str, Any]) -> Path:
    for key in ("profile1", "profile2", "abortProfile"):
        candidate = Path(state[key])
        if not path_exists(candidate):
            return candidate
    raise SafetyError("No preallocated retained-profile path is available; no mutation was performed.")


def action_restore(state_path: Path) -> None:
    require_processes_absent()
    state = load_state(state_path)
    reconcile_pending(state_path, state)
    canonical = Path(state["canonical"])
    original_backup = Path(state["originalBackup"])
    original_expected = state["original"]

    if path_exists(canonical) and same_identity(path_identity(canonical), original_expected["directory"]):
        if path_exists(original_backup):
            raise SafetyError("Original identity appears at canonical and backup paths; no mutation was performed.")
        verify_identity(canonical, original_expected)
        state["phase"] = "restored"
        state["pending"] = None
        save_state(state_path, state)
        print(json.dumps({"phase": "restored", "canonical": str(canonical), "tree": original_expected["tree"]}, indent=2))
        return

    if not path_exists(original_backup) or not stat.S_ISDIR(lstat_safe(original_backup).st_mode):
        raise SafetyError(f"Known immutable original backup is missing; no mutation was performed: {original_backup}")
    verify_identity(original_backup, original_expected)

    if path_exists(canonical):
        test_digest = tree_digest(canonical)
        test_expected = expected_identity(canonical, test_digest)
        target = select_abort_target(state)
        transactional_move(state_path, state, canonical, target, test_expected, "abort-profile-retained")
        state["abortTree"] = test_digest
        state["abortRetainedAt"] = str(target)
        save_state(state_path, state)

    transactional_move(state_path, state, original_backup, canonical, original_expected, "restored")
    verify_identity(canonical, original_expected)
    print(json.dumps({
        "phase": "restored",
        "canonical": str(canonical),
        "originalTree": original_expected["tree"],
        "profile1": state["profile1"] if path_exists(Path(state["profile1"])) else None,
        "profile2": state["profile2"] if path_exists(Path(state["profile2"])) else None,
        "abortProfile": state.get("abortRetainedAt"),
    }, indent=2))


def write_fixture(path: Path, name: str) -> dict[str, Any]:
    path.mkdir()
    (path / "payload.bin").write_bytes(name.encode("utf-8"))
    return expected_identity(path, tree_digest(path))


def fixture_state(root: Path, source: Path, target: Path, expected: dict[str, Any], before: str, after: str) -> tuple[Path, dict[str, Any]]:
    state_path = root / "state.json"
    state = {
        "schema": 1,
        "canonical": str(root / "canonical"),
        "originalBackup": str(root / "original"),
        "profile1": str(root / "profile1"),
        "profile2": str(root / "profile2"),
        "abortProfile": str(root / "abort"),
        "phase": before,
        "pending": {
            "source": str(source),
            "target": str(target),
            "expectedIdentity": expected,
            "beforePhase": before,
            "afterPhase": after,
        },
        "original": expected,
    }
    durable_write_json(state_path, state, initial=True)
    return state_path, state


def action_self_test() -> None:
    transitions = [
        ("original-to-backup", "before-original-backup", "original-backed-up"),
        ("warm-to-retained", "c1-complete", "warm-retained"),
        ("c2-to-retained", "warm-retained", "c2-retained"),
        ("backup-to-canonical", "c2-retained", "restored"),
    ]
    passed: list[str] = []
    with tempfile.TemporaryDirectory(prefix="clackly-profile-transaction-") as temporary:
        base = Path(temporary)
        for label, before, after in transitions:
            for applied in (False, True):
                case = base / f"{label}-{'applied' if applied else 'pending'}"
                case.mkdir()
                source = case / "source"
                target = case / "target"
                expected = write_fixture(source, label)
                state_path, state = fixture_state(case, source, target, expected, before, after)
                if applied:
                    os.rename(source, target)
                result = reconcile_pending(state_path, state)
                final = load_state(state_path)
                expected_result = "applied" if applied else "not-applied"
                expected_phase = after if applied else before
                if result != expected_result or final["phase"] != expected_phase or final["pending"] is not None:
                    raise SafetyError(f"Recovery fixture failed: {label}/{expected_result}")
                verify_identity(target if applied else source, expected)
                passed.append(f"{label}:{expected_result}")

            normal = base / f"{label}-normal"
            normal.mkdir()
            source = normal / "source"
            target = normal / "target"
            expected = write_fixture(source, label)
            state_path, state = fixture_state(normal, source, target, expected, before, after)
            state["pending"] = None
            durable_write_json(state_path, state)
            transactional_move(
                state_path,
                state,
                source,
                target,
                expected,
                after,
                observe_processes=False,
            )
            final = load_state(state_path)
            if final["phase"] != after or final["pending"] is not None or path_exists(source):
                raise SafetyError(f"Normal transactional fixture failed: {label}")
            verify_identity(target, expected)
            passed.append(f"{label}:transaction")

        digest_case = base / "digest"
        digest_case.mkdir()
        (digest_case / "empty").mkdir()
        (digest_case / "file.txt").write_text("digest", encoding="utf-8")
        first = tree_digest(digest_case)
        second = tree_digest(digest_case)
        if first != second or first["directories"] != 1 or first["files"] != 1:
            raise SafetyError("Deterministic digest fixture failed.")
        passed.append("deterministic-digest")

        ambiguous = base / "ambiguous"
        ambiguous.mkdir()
        source = ambiguous / "source"
        target = ambiguous / "target"
        expected = write_fixture(source, "source")
        write_fixture(target, "target")
        state_path, state = fixture_state(ambiguous, source, target, expected, "before", "after")
        try:
            reconcile_pending(state_path, state)
        except SafetyError:
            unchanged = load_state(state_path)
            if unchanged["pending"] is None:
                raise SafetyError("Ambiguous recovery fixture cleared pending state.")
        else:
            raise SafetyError("Ambiguous recovery fixture did not fail closed.")
        passed.append("ambiguous-pending:fail-closed")

        orphan_case = base / "orphan-guard"
        orphan_case.mkdir()
        canonical = orphan_case / "Clackly Workflow Plugin"
        canonical.mkdir()
        (orphan_case / "Clackly Workflow Plugin.trellis-original-fixture").mkdir()
        try:
            assert_prepare_slot(canonical, orphan_case / "state.json")
        except SafetyError:
            pass
        else:
            raise SafetyError("Orphaned-original guard fixture did not fail closed.")
        passed.append("orphaned-original:fail-closed")

    print(json.dumps({"passed": passed, "count": len(passed)}, indent=2))


def action_status(state_path: Path) -> None:
    state = load_state(state_path)
    paths = {key: {"path": state[key], "exists": path_exists(Path(state[key]))} for key in ("canonical", "originalBackup", "profile1", "profile2", "abortProfile")}
    print(json.dumps({"phase": state["phase"], "pending": state["pending"], "paths": paths, "originalTree": state["original"]["tree"]}, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action",
        choices=("self-test", "prepare", "mark-c1-complete", "retain-warm", "retain-c2", "restore", "status"),
    )
    parser.add_argument("--state", type=Path, default=STATE)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    actions = {
        "self-test": lambda: action_self_test(),
        "prepare": lambda: action_prepare(args.state),
        "mark-c1-complete": lambda: action_mark_c1(args.state),
        "retain-warm": lambda: action_retain_warm(args.state),
        "retain-c2": lambda: action_retain_c2(args.state),
        "restore": lambda: action_restore(args.state),
        "status": lambda: action_status(args.state),
    }
    try:
        actions[args.action]()
        return 0
    except SafetyError as exc:
        print(f"SAFETY STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
