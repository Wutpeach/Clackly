# Experiment Safety Snapshot

Captured 2026-07-29 before controlled runs.

## Original installed entrypoints

- Workflow Plugin: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly`
  - Link type: `Junction`
  - Target: `D:\Clackly\resolve-command-center`
- Utility: `C:\Users\Administrator\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\Clackly.py`
  - Link type: `SymbolicLink`
  - Target: `D:\Clackly\resolve-command-center\resolve\Clackly.py`

Both links are on `C:`. Holding paths are on the same drive and outside Resolve scan roots:

- `C:\ProgramData\Clackly-Trellis-Hold\07-29-resolve-startup-freeze\com.wutpeach.clackly`
- `C:\Users\Administrator\AppData\Roaming\Clackly-Trellis-Hold\07-29-resolve-startup-freeze\Clackly.py`

## Pre-run process state

- No `Resolve.exe`, Resolve-bundled `electron.exe`, or standalone Clackly Electron process was running.
- A detached Utility bridge remained from `2026-07-29 09:59:05`:
  - PID 81912: `python D:\Clackly\resolve-command-center\bridge\server.py`
  - PID 81448: child Python process running the same server.
- These exact bridge processes are stopped before the baseline so they cannot confound the A/B result.

## Recovery commands

Run only while Resolve is not running:

```powershell
Move-Item -LiteralPath 'C:\ProgramData\Clackly-Trellis-Hold\07-29-resolve-startup-freeze\com.wutpeach.clackly' -Destination 'C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly'
Move-Item -LiteralPath 'C:\Users\Administrator\AppData\Roaming\Clackly-Trellis-Hold\07-29-resolve-startup-freeze\Clackly.py' -Destination 'C:\Users\Administrator\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility\Clackly.py'
```

Never delete either held entrypoint or its target.
