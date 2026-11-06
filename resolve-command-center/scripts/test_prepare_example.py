import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("report", Path(__file__).resolve().parents[2] / "skills" / "clackly-developer" / "examples" / "timeline-summary" / "report.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class Timeline:
    def __init__(self, uid, name):
        self.uid, self.name = uid, name
    def GetUniqueId(self): return self.uid
    def GetName(self): return self.name


class Project:
    def __init__(self, uid, entries, current=None):
        self.uid, self.entries, self.current = uid, entries, current
    def GetUniqueId(self): return self.uid
    def GetName(self): return "项目甲"
    def GetTimelineCount(self): return len(self.entries)
    def GetTimelineByIndex(self, index): return self.entries[index - 1]
    def GetCurrentTimeline(self): return self.current


class Resolve:
    def __init__(self, project): self.project = project
    def GetProjectManager(self): return self
    def GetCurrentProject(self): return self.project


def context(project, phase="prepare", inputs=None):
    return SimpleNamespace(resolve=Resolve(project), phase=phase, input=inputs or {})


class ReportTests(unittest.TestCase):
    def setUp(self):
        self.first = Timeline("one", "同名")
        self.second = Timeline("two", "同名")
        self.project = Project("project-a", [self.first, self.second], self.second)
        self.prepared = report.prepare(context(self.project))
        self.selected = self.prepared["defaults"]["timeline"]

    def test_no_project_and_no_timelines(self):
        for project in (None, Project("empty", [])):
            prepared = report.prepare(context(project))
            self.assertEqual(prepared["options"]["timeline"], [])
            self.assertTrue(prepared["message"])

    def test_same_names_preselect_current_and_execute_exact_target(self):
        options = self.prepared["options"]["timeline"]
        self.assertNotEqual(options[0]["label"], options[1]["label"])
        self.assertEqual(self.selected, options[1]["value"])
        result = report.execute(context(self.project, "execute", {"timeline": self.selected, "title": "审阅"}))
        self.assertEqual(result["text"], "审阅")
        self.assertEqual(result["fields"][-1]["value"], "two")

    def test_removed_target_fails_without_substitution(self):
        self.project.entries.remove(self.second)
        with self.assertRaisesRegex(ValueError, "已删除"):
            report.execute(context(self.project, "execute", {"timeline": self.selected}))

    def test_switched_project_fails(self):
        with self.assertRaisesRegex(ValueError, "切换"):
            report.execute(context(Project("project-b", [self.second]), "execute", {"timeline": self.selected}))

    def test_old_host_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "动态准备"):
            report.execute(SimpleNamespace())


if __name__ == "__main__":
    unittest.main()
