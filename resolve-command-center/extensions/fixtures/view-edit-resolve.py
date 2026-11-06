"""File-backed disposable Resolve fixture. Never imports the native bridge."""
import json
import time
from pathlib import Path

STATE = Path(__file__).with_name("view-environment.json")


def read():
    return json.loads(STATE.read_text(encoding="utf-8"))


def write(data, event):
    data.setdefault("writes", []).append(event)
    STATE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


class Timeline:
    def __init__(self, timeline_id):
        self.id = timeline_id

    def GetUniqueId(self):
        return self.id

    def GetName(self):
        return read()["timelines"][self.id]

    def SetName(self, name):
        data = read()
        time.sleep(data.get("writeDelay", 0))
        if self.id in data.get("throwIds", []):
            raise RuntimeError("Fixture Resolve API exception")
        if self.id in data.get("failIds", []) or self.id not in data["timelines"]:
            return False
        data["timelines"][self.id] = name
        write(data, {"kind": "rename", "id": self.id, "name": name})
        return True


class Project:
    def GetUniqueId(self):
        return read()["project"]

    def GetName(self):
        return "Clackly 可丢弃测试项目"

    def GetTimelineCount(self):
        return len(read()["timelines"])

    def GetTimelineByIndex(self, index):
        keys = list(read()["timelines"])
        return Timeline(keys[index - 1]) if 1 <= index <= len(keys) else None

    def GetMediaPool(self):
        return self

    def CreateEmptyTimeline(self, name):
        data = read()
        time.sleep(data.get("writeDelay", 0))
        if data.get("failCreate"):
            return None
        timeline_id = "created-" + str(len(data.get("writes", [])))
        data["timelines"][timeline_id] = name
        write(data, {"kind": "create", "id": timeline_id, "name": name})
        return Timeline(timeline_id)


class Resolve:
    def GetProjectManager(self):
        return self

    def GetCurrentProject(self):
        return Project() if read().get("project") else None


def scriptapp(_name):
    return Resolve()
