# Controlled Standalone + Workflow Overlap Snapshot

## Clean slate

- Resolve was closed.
- Workflow Plugin junction and Utility symlink were both restored at their exact original paths.
- No Clackly bridge, npm/Node, standalone Electron, or Workflow Electron process was running.
- Bridge ports 49371 and 49472 were unavailable before launch.

## Supported standalone launch

Command run at `2026-07-29 15:19:17` from `D:\Clackly\resolve-command-center`:

```powershell
python resolve\Clackly.py
```

The existing launcher auto-detected Resolve scripting paths, started the bridge, received HTTP 200 health, then ran the historical default `npm.cmd run start` path.

## Exact experiment-created process tree

- Bridge Python 70468 -> child Python 23760.
- npm Node 77960 -> cmd 35252 -> Electron launcher Node 3328.
- Standalone Electron main 50784:
  - GPU child 66788.
  - network utility child 47260.
  - renderer child 83820.

Bridge health: `http://127.0.0.1:49371/health` returned `{"ok":true}`.

Only these exact experiment-created Clackly processes may be terminated during cleanup after Resolve closes.
