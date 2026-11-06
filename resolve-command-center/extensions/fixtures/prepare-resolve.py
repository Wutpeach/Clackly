"""Isolated Resolve API fixture; excluded from the production payload."""
import json
import time
from pathlib import Path


def scriptapp(_name):
    data = json.loads(Path(__file__).with_name('prepare-environment.json').read_text())
    if data.get('mode') == 'failed':
        raise ValueError('Fixture connection unavailable')
    if data.get('mode') == 'timeout':
        time.sleep(12)
    if data.get('mode') == 'slow':
        time.sleep(1)

    class Timeline:
        def __init__(self, identity):
            self.identity = identity

        def GetUniqueId(self):
            return self.identity

        def GetName(self):
            return '同名时间线'

    class Project:
        def GetUniqueId(self):
            return data['project']

        def GetName(self):
            return '隔离项目'

        def GetTimelineCount(self):
            return len(data.get('timelines', []))

        def GetTimelineByIndex(self, index):
            return Timeline(data['timelines'][index - 1])

        def GetCurrentTimeline(self):
            return Timeline(data['current']) if data.get('current') else None

    class Resolve:
        def GetProjectManager(self):
            return self

        def GetCurrentProject(self):
            return Project() if data.get('project') else None

    return Resolve()
