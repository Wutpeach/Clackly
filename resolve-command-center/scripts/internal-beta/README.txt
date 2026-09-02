Clackly Internal Beta for Windows x64
======================================

Version: supplied by the package filename and manifest
Supported host: DaVinci Resolve Studio 20.3.2.9 on Windows x64

This is an unsigned internal Beta. Windows may show a security or reputation
prompt because the package is not code signed. Follow your organisation's
normal internal-software process; do not disable system-wide security settings.

Install
-------
1. Extract the complete ZIP to a local folder. The folder may contain spaces
   or Chinese characters.
2. Close DaVinci Resolve completely. The installer will refuse to continue if
   Resolve is running and it will never terminate Resolve for you.
3. Double-click "安装 Clackly.bat" and approve the single UAC prompt.
4. Start DaVinci Resolve, then choose:
   Workspace > Workflow Integrations > Clackly

Upgrade or reinstall
--------------------
Run "安装 Clackly.bat" from the newer or same-version extracted Beta. The
installer stages and verifies the new plugin before replacing the recognized
Clackly target. If activation or verification fails, it restores the prior
plugin automatically. Installing an older Beta over a newer one is refused.

Uninstall
---------
Close Resolve, then double-click "卸载 Clackly.bat". It removes only this
Clackly Workflow Integration plugin. It does not remove sibling plugins and
it preserves your Clackly settings under %APPDATA%\Clackly.

Integrity
---------
SHA256SUMS.txt inventories every distributable file. The installer verifies
the inventory, the package version/id, the managed Runtime, and the bundled
WorkflowIntegration.node before changing the plugin target. This internal
hash list detects corruption or incomplete extraction; it is not a substitute
for publisher code signing.

Troubleshooting
---------------
- Exit code 12: close DaVinci Resolve and retry.
- Exit code 10: extract the full ZIP again; a required file or hash failed.
- Exit code 14: an unexpected, linked, corrupt, or newer target is present;
  do not delete broad Resolve folders. Contact the internal Beta owner.
- Exit codes 16-18: retain the displayed task-owned transaction path and
  contact the internal Beta owner with the displayed code.

This package needs no Node.js, npm, Python, Resolve Developer Examples, or
network connection on the tester machine.
