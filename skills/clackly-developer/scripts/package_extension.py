#!/usr/bin/env python3
"""Package a clean Extension V1 source folder; never import extension code."""

import argparse
import ast
import json
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


ID = re.compile(r"[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*")


def check_identity(value, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    identity = value.get("id")
    if (not isinstance(identity, str) or not ID.fullmatch(identity)
            or len(identity) > 80 or identity in {"constructor", "prototype"}):
        raise ValueError(f"{label}: invalid id")
    if not isinstance(value.get("name"), str) or not value["name"].strip():
        raise ValueError(f"{label}: name is required")


def package(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_dir():
        raise ValueError("Source must be a directory containing manifest.json")
    if output == source or source in output.parents:
        raise ValueError("Output must be outside the package source directory")
    if output.suffix.lower() != ".clackly":
        raise ValueError("Output must end in .clackly")
    if output.exists():
        raise ValueError("Output already exists; choose another filename")

    manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    check_identity(manifest, "Extension")
    if type(manifest.get("schemaVersion")) is not int or manifest["schemaVersion"] != 1:
        raise ValueError("schemaVersion must be 1")
    if not isinstance(manifest.get("version"), str) or not manifest["version"]:
        raise ValueError("version must be a canonical SemVer string, e.g. 1.0.0")
    commands = manifest.get("commands")
    if not isinstance(commands, list) or not commands:
        raise ValueError("commands must be a nonempty array")
    if not isinstance(manifest.get("configSchema", {}), dict):
        raise ValueError("configSchema must be an object")

    files = {}
    spellings = {}

    def collect(directory):
        for file in sorted(directory.iterdir()):
            if (file.name.startswith(".") or file.name == "__pycache__"
                    or file.suffix.lower() in {".pyc", ".pyo", ".clackly"}):
                continue
            mode = file.lstat().st_mode
            if file.is_symlink() or getattr(file, "is_junction", lambda: False)():
                raise ValueError(f"Links are not package files: {file.name}")
            name = file.relative_to(source).as_posix()
            previous = spellings.setdefault(name.lower(), name)
            if previous != name:
                raise ValueError(f"Case-colliding package path: {name}")
            if stat.S_ISDIR(mode):
                collect(file)
            elif stat.S_ISREG(mode):
                files[name] = file
            else:
                raise ValueError(f"Not a regular package file: {name}")

    collect(source)
    if "manifest.json" not in files:
        raise ValueError("Root manifest.json must use that exact filename")
    trees = {}
    for name, file in files.items():
        if file.suffix == ".py":
            text = file.read_bytes()
            trees[name] = ast.parse(text, filename=name)
            compile(text, name, "exec")
    ids = set()
    for command in commands:
        check_identity(command, "Command")
        if command["id"] in ids:
            raise ValueError(f"Duplicate Command id: {command['id']}")
        ids.add(command["id"])
        entry = command.get("entry")
        if (not isinstance(entry, str) or not entry.endswith(".py")
                or PurePosixPath(entry).is_absolute() or "\\" in entry
                or any(part in {"", ".", ".."} for part in entry.split("/"))
                or entry not in trees):
            raise ValueError(f"Missing or invalid exact Python entry: {entry}")
        if not any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                   and node.name == "execute" for node in trees[entry].body):
            raise ValueError(f"{entry} must define top-level execute(context)")

    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects existing user artifacts, including concurrent writers.
    with output.open("xb") as stream:
        try:
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name, file in files.items():
                    archive.write(file, name)
        except BaseException:
            stream.close()
            output.unlink()
            raise
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Clean package folder with root manifest.json")
    parser.add_argument("output", type=Path, help="New .clackly path outside source")
    args = parser.parse_args()
    try:
        count = package(args.source, args.output)
    except (OSError, ValueError, SyntaxError) as error:
        print(f"Package failed: {error}", file=sys.stderr)
        return 1
    print(f"Created {args.output.resolve()} ({count} files). Import via Clackly Settings > Extensions.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
