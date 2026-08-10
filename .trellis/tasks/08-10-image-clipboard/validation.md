# Validation

## Automated

- `npm test`: 260 Node tests plus Python suites (bridge 6, resolve 26, script-runtime 15, resolve2ae_core 32, scripts 2), all passed.
- `npm run build`: Vite production build passed.
- `npm run runtime:stage`: managed CPython 3.13.14 staging passed.
- `npm run package:win`: Windows dir package passed.
- `npm run package:verify`: packaged runtime/application inventory passed after fresh staging/package.
- `python -m py_compile resolve/adapter.py bridge/resolve_bridge.py bridge/server.py`: passed.
- `git diff --check`: passed.

## Architecture Audit

- No Electron imports or `clipboard.readImage` calls exist in Core, Capability, Command, execution-adapter, or Resolve layers.
- Media Pool API calls are contained under `resolve/adapter.js` and `resolve/adapter.py`.
- No Timeline insertion APIs were introduced.
- No Command Engine, plugin runtime, or Settings architecture was added.

## Package Installation

`npm run workflow:install:package` was attempted after package verification. It could not replace the installed `WorkflowIntegration.node` because Resolve was running and holding the file. No process was terminated; installation must be retried after Resolve is fully closed.
