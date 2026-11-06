"""Isolated fake Resolve for Extension Views tests; no native library or user state."""
import json
import time
from pathlib import Path


def scriptapp(_name):
    data = json.loads(Path(__file__).with_name('view-environment.json').read_text(encoding='utf-8'))
    if data.get('mode') == 'failed':
        raise ValueError('Fixture connection unavailable')
    if data.get('mode') == 'timeout':
        time.sleep(12)
    if data.get('mode') == 'slow':
        time.sleep(0.8)

    class Timeline:
        def GetUniqueId(self):
            return data.get('timeline', 't1')

        def GetName(self):
            return '审片时间线'

        def GetMarkers(self):
            return {int(frame): marker for frame, marker in data.get('markers', {}).items()}

    class Project:
        def GetUniqueId(self):
            return data.get('project', 'p1')

        def GetName(self):
            return '隔离审片项目'

        def GetCurrentTimeline(self):
            return Timeline() if data.get('timeline', 't1') else None

    class Resolve:
        def GetProjectManager(self):
            return self

        def GetCurrentProject(self):
            return Project() if data.get('project', 'p1') else None

    return Resolve()
