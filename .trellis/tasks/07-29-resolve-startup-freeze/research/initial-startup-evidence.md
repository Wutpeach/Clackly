# Initial Startup Evidence

## Installed Entry Points

- Workflow Plugin: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly` is a junction to `D:\Clackly\resolve-command-center`.
- Utility script: `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\Clackly.py` is a symlink to `resolve-command-center\resolve\Clackly.py`.

## Resolve Log Correlation

Source: `%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\logs\davinci_resolve.log`.

Multiple Resolve sessions show the same shape after `UiWIPlugin : Loaded plugin:com.wutpeach.clackly`: normal events continue for several seconds, followed by a long interval without log events. Measured gaps include 14.070s, 15.158s, 12.684s, and 28.642s.

In the latest captured session:

- Main loop launched: `14:17:17.383`.
- Clackly Workflow Plugin loaded: `14:17:21.962`.
- Workflow interface established: `14:17:22.191`.
- Last event before the largest gap: `14:17:29.019`.
- Next event: `14:17:57.661`.

The timing matches the user-observed delayed freeze, but a log gap alone does not prove the plugin blocked Resolve.

## Utility Launcher Evidence

Source: `%APPDATA%\Clackly\clackly.log`.

The last recorded Utility launch was `09:59:05`:

- bridge process launched at `09:59:05`;
- bridge health succeeded at `09:59:06`;
- `npm.cmd run start` launched at `09:59:06`.

Later Resolve sessions loaded the Workflow Plugin but did not add Utility launcher entries. This makes the Workflow Plugin the stronger initial suspect for current startup freezes, while the Utility path remains a secondary duplicate-installation risk.

## Relevant Code Paths

- `workflow-plugin/main.js` initializes Workflow Integration, creates the Electron window, registers IPC/global shortcut handlers, and holds Resolve lifecycle callbacks.
- Resolve itself starts `C:\Program Files\Blackmagic Design\DaVinci Resolve\Electron\electron.exe` for the plugin.
- `resolve/Clackly.py` starts a Python bridge and defaults to `npm.cmd run start`, which performs a Vite build before standalone Electron startup.

## Required Next Evidence

1. Baseline startup with both Clackly entrypoints disabled.
2. Workflow Plugin-only startup.
3. Process resource sampling around plugin load and the freeze window.
4. If needed, temporary timing logs around each Workflow Plugin initialization step.

