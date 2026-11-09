---
title: "Download and install on Windows"
description: "Clackly v0.1.6 guide: Download and install on Windows"
---

Download **Clackly-Setup-0.1.6-win-x64.exe** from the [official v0.1.6 Release](https://github.com/Wutpeach/Clackly/releases/tag/v0.1.6). End users do not need a source checkout, Node or an application build.

## Before installing

Use Windows x64 with DaVinci Resolve Studio and its official Workflow Integration / Scripting components installed. Save your work and close Resolve yourself when prompted. Installation may request UAC elevation. Do not change permissions across the shared Resolve directory just to install Clackly.

The installer is unsigned. Windows may show SmartScreen or “Unknown publisher”. Verify the official source, filename, size and SHA-256 before deciding to continue. You do not need to disable Windows security.

~~~powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Clackly-Setup-0.1.6-win-x64.exe
~~~

v0.1.6 EXE: **28,965,825 bytes**. SHA-256:

~~~text
00d1400b8e67678d6e67c51da065c30ca2a4884478e32d7fa3269da8b9b4fb25
~~~

## Install and open

1. Run the EXE and follow its instructions. Normal upgrades retain settings and preferences.
2. Restart Resolve Studio yourself.
3. Select **Workspace → Workflow Integrations → Clackly**. Menu loading is not a promise of silent automatic startup with Resolve.
4. Press **Ctrl + Space** and follow [first use](/Clackly/en/docs/first-use/).

The installer contains the application, renderer and managed Python Runtime. **WorkflowIntegration.node is excluded**; installation verifies and copies the official local Resolve SamplePlugin component. If it is missing or incompatible, repair the official Resolve installation instead of downloading native files from an unknown source.

The fixed installation location is:

~~~text
%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly
~~~

Offline installation, standard-user UAC and full uninstall have not had dedicated real-machine acceptance. Release publication and local installation are separate facts. See [troubleshooting](/Clackly/en/docs/troubleshooting/).
