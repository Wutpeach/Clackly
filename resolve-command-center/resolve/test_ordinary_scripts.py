import importlib.util
import tempfile
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("ordinary_scripts", Path(__file__).with_name("ordinary_scripts.py"))
ordinary_scripts = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ordinary_scripts)


class Fusion:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def RunScript(self, absolute_path, variables):
        self.calls.append((absolute_path, variables))
        if self.error:
            raise self.error
        return self.result


class Resolve:
    def __init__(self, fusion, project=None):
        self.fusion = fusion
        self.project = project

    def Fusion(self):
        return self.fusion

    def GetProjectManager(self):
        return type("Manager", (), {"GetCurrentProject": lambda _self: self.project})()


class Module:
    def __init__(self, resolve):
        self.resolve = resolve

    def scriptapp(self, _name):
        return self.resolve


class OrdinaryScriptsTests(unittest.TestCase):
    def roots(self, directory):
        system = directory / "program-data" / "Blackmagic Design" / "DaVinci Resolve" / "Fusion" / "Scripts"
        user = directory / "app-data" / "Blackmagic Design" / "DaVinci Resolve" / "Support" / "Fusion" / "Scripts"
        return [("system", system), ("user", user)]

    def test_official_roots_use_the_documented_windows_environment_locations(self):
        program_data = Path(r"C:\ProgramData-Test")
        app_data = Path(r"C:\Users\Tester\AppData\Roaming")
        roots = ordinary_scripts.official_roots({"PROGRAMDATA": str(program_data), "APPDATA": str(app_data)})
        base = Path("Blackmagic Design") / "DaVinci Resolve"

        self.assertEqual(roots, [
            ("system", program_data / base / "Fusion" / "Scripts"),
            ("user", app_data / base / "Support" / "Fusion" / "Scripts")
        ])

    def test_discovery_keeps_basic_metadata_and_canonical_identity(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            roots = self.roots(Path(temporary_directory))
            system_file = roots[0][1] / "Utility" / "Nested" / "Example.PY"
            user_file = roots[1][1] / "Edit" / "Example.lua"
            system_file.parent.mkdir(parents=True)
            user_file.parent.mkdir(parents=True)
            system_file.write_text("# script", encoding="utf-8")
            user_file.write_text("-- script", encoding="utf-8")

            snapshot = ordinary_scripts.discover(roots)

            self.assertEqual([(item["name"], item["language"], item["source"]) for item in snapshot["scripts"]], [
                ("Example", "python", "system"), ("Example", "lua", "user")
            ])
            self.assertEqual(snapshot["scripts"][0]["category"], "Utility")
            self.assertEqual(snapshot["scripts"][0]["nesting"], ["Nested"])
            self.assertEqual(snapshot["scripts"][0]["id"], ordinary_scripts.script_id(system_file))
            self.assertNotEqual(snapshot["scripts"][0]["id"], snapshot["scripts"][1]["id"])
            self.assertEqual(snapshot, ordinary_scripts.discover(roots))
            duplicate = ordinary_scripts.discover([roots[0], roots[0]])
            self.assertEqual(len(duplicate["scripts"]), 1)
            self.assertEqual(duplicate["diagnostics"][0]["code"], "duplicate_path")

    def test_revalidation_rejects_a_removed_or_retyped_selection(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            roots = self.roots(Path(temporary_directory))
            candidate = roots[0][1] / "Utility" / "Example.py"
            candidate.parent.mkdir(parents=True)
            candidate.write_text("# script", encoding="utf-8")
            record = ordinary_scripts.discover(roots)["scripts"][0]
            candidate.unlink()
            candidate.with_suffix(".txt").write_text("changed", encoding="utf-8")

            self.assertIsNone(ordinary_scripts.validated_selection(record["id"], record["absolutePath"], roots))
            unsupported = roots[0][1] / "Utility" / "Other.txt"
            unsupported.write_text("changed", encoding="utf-8")
            self.assertIsNone(ordinary_scripts.validated_selection(
                ordinary_scripts.script_id(unsupported), str(unsupported), roots
            ))
            outside = Path(temporary_directory) / "outside.py"
            outside.write_text("# script", encoding="utf-8")
            self.assertIsNone(ordinary_scripts.validated_selection(
                ordinary_scripts.script_id(outside), str(outside), roots
            ))

    def test_python_project_and_lua_direct_path_each_call_runscript_once(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            roots = self.roots(Path(temporary_directory))
            python_file = roots[0][1] / "Utility" / "Example.py"
            lua_file = roots[0][1] / "Utility" / "Example.lua"
            python_file.parent.mkdir(parents=True)
            python_file.write_text("# script", encoding="utf-8")
            lua_file.write_text("-- script", encoding="utf-8")
            records = ordinary_scripts.discover(roots)["scripts"]
            python_record = next(record for record in records if record["language"] == "python")
            lua_record = next(record for record in records if record["language"] == "lua")
            project = object()
            fusion = Fusion()
            module = Module(Resolve(fusion, project))

            python_result = ordinary_scripts.invoke({
                "requestId": "python", "scriptId": python_record["id"], "absolutePath": python_record["absolutePath"]
            }, roots, module)
            lua_result = ordinary_scripts.invoke({
                "requestId": "lua", "scriptId": lua_record["id"], "absolutePath": lua_record["absolutePath"]
            }, roots, module)

            self.assertEqual(python_result["status"], "api_returned")
            self.assertIsNone(python_result["apiReturn"])
            self.assertEqual(lua_result["status"], "api_returned")
            self.assertEqual(len(fusion.calls), 2)
            self.assertEqual(fusion.calls[0][0], python_record["absolutePath"])
            self.assertEqual(fusion.calls[1][0], lua_record["absolutePath"])
            self.assertIs(fusion.calls[0][1]["project"], project)
            self.assertEqual(fusion.calls[1][1], {})

    def test_missing_host_and_api_exception_are_not_completion_claims(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            roots = self.roots(Path(temporary_directory))
            candidate = roots[0][1] / "Utility" / "Example.py"
            candidate.parent.mkdir(parents=True)
            candidate.write_text("# script", encoding="utf-8")
            record = ordinary_scripts.discover(roots)["scripts"][0]
            request = {"requestId": "request", "scriptId": record["id"], "absolutePath": record["absolutePath"]}

            self.assertEqual(ordinary_scripts.invoke(request, roots, Module(None))["status"], "not_submitted")
            fusion = Fusion(error=RuntimeError("after call boundary"))
            result = ordinary_scripts.invoke(request, roots, Module(Resolve(fusion)))
            self.assertEqual(result["status"], "submission_unknown")
            self.assertEqual(len(fusion.calls), 1)


if __name__ == "__main__":
    unittest.main()
