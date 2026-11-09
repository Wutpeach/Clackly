---
title: "Download and install on Windows"
description: "Get the official Windows installer and load Clackly in Resolve."
---

Download **Clackly-Setup-0.1.7-win-x64.exe** from the [official v0.1.7 Release](https://github.com/Wutpeach/Clackly/releases/tag/v0.1.7). End users do not need a source checkout, Node or an application build.

## Before installing

Prepare Windows x64, DaVinci Resolve Studio and its official Workflow Integration / Scripting components. See the [compatibility scope](/Clackly/en/docs/#supported-context). Save your work and close Resolve when prompted; installation may require administrator access.

The installer is unsigned. Windows may show SmartScreen or “Unknown publisher”. Verify the official source, filename, size and SHA-256 before deciding to continue. You do not need to disable Windows security.

~~~powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Clackly-Setup-0.1.7-win-x64.exe
~~~

v0.1.7 EXE: **29,101,412 bytes**. SHA-256:

~~~text
c6f5f54239db4ccd7df7576c50f24a1cad8b07fcc86f7e66211b27ae37221dad
~~~

## Install and open

1. Run the EXE and follow its instructions. Normal upgrades retain settings and preferences.
2. Restart Resolve Studio yourself.
3. Select **Workspace → Workflow Integrations → Clackly**. Load the plugin here each time you restart Resolve.
4. Press **Ctrl + Space** and follow [first use](/Clackly/en/docs/first-use/).

The installer includes Clackly and its managed Python runtime. **WorkflowIntegration.node is excluded**; installation verifies and copies it from the official local Resolve SamplePlugin. If it is missing, repair the official Resolve installation and retry. Do not download it from other sources.

The fixed installation location is:

~~~text
%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.wutpeach.clackly
~~~

Offline installation, standard-user UAC and full uninstall have not had dedicated acceptance. Keep error records and follow [troubleshooting](/Clackly/en/docs/troubleshooting/) if installation fails. Do not change permissions across the shared Resolve directory yourself.
