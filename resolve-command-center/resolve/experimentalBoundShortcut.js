const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");

const { ShortcutManager } = require("../shortcut/ShortcutManager");

const ACTIONS = Object.freeze({
  "deselect-all": Object.freeze({
    functionName: "EXPERIMENTAL_RESOLVE_DESELECT_ALL",
    selectedClipCount: (count) => count > 0
  }),
  "enable-clip": Object.freeze({
    functionName: "EXPERIMENTAL_RESOLVE_ENABLE_CLIP",
    selectedClipCount: (count) => count === 1
  })
});

const KEY_CODES = Object.freeze({
  CTRL: 0x11,
  ALT: 0x12,
  SHIFT: 0x10
});
const MODIFIER_CODES = new Set(Object.values(KEY_CODES));
const EVIDENCE_MAX_AGE_MS = 10 * 60 * 1000;
const EVIDENCE_FUTURE_TOLERANCE_MS = 60 * 1000;

const KEYBOARD_CONFIG_PARTS = Object.freeze([
  "Blackmagic Design",
  "DaVinci Resolve",
  "Preferences",
  "keyboard.preset.xml"
]);

// Fixed code only: caller data is validated key-code/PID/HWND text in this child environment.
// There is no script, command, or arbitrary global-key payload on the IPC boundary.
const WINDOWS_HELPER = String.raw`
$ErrorActionPreference = "Stop"
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ClacklyShortcutSpike {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
  }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT {
    public uint type; public INPUTUNION U;
  }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
}
'@

function Get-ResolveTarget {
  $targets = @(Get-Process -Name Resolve -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
  if ($targets.Count -ne 1) { throw "Expected exactly one Resolve main window" }
  $target = $targets[0]
  if ($target.ProcessName -ine "Resolve") { throw "Resolve process identity did not match" }
  if ([string]$target.Path -notmatch '(?i)\\Blackmagic Design\\DaVinci Resolve\\Resolve\.exe$') { throw "Resolve executable identity did not match" }
  return $target
}

function Get-ForegroundPid([IntPtr]$window) {
  [uint32]$processId = 0
  [void][ClacklyShortcutSpike]::GetWindowThreadProcessId($window, [ref]$processId)
  return $processId
}

function Get-WindowKeyboardLayout([IntPtr]$window) {
  [uint32]$ownerProcessId = 0
  $threadId = [ClacklyShortcutSpike]::GetWindowThreadProcessId($window, [ref]$ownerProcessId)
  if ($threadId -eq 0) { throw "Could not read Resolve window thread" }
  return ('{0:X16}' -f [ClacklyShortcutSpike]::GetKeyboardLayout($threadId).ToInt64()).ToLowerInvariant()
}

function New-KeyInput([uint16]$key, [uint32]$flags) {
  $input = New-Object ClacklyShortcutSpike+INPUT
  $input.type = 1
  $input.U.ki.wVk = $key
  $input.U.ki.dwFlags = $flags
  return $input
}

function Release-Keys([uint16[]]$keys) {
  if (!$keys -or $keys.Count -eq 0) { return 0 }
  $release = New-Object 'ClacklyShortcutSpike+INPUT[]' $keys.Count
  for ($i = 0; $i -lt $keys.Count; $i++) {
    $release[$i] = New-KeyInput $keys[$keys.Count - 1 - $i] 2
  }
  return [int][ClacklyShortcutSpike]::SendInput([uint32]$release.Length, $release, [Runtime.InteropServices.Marshal]::SizeOf([type]'ClacklyShortcutSpike+INPUT'))
}

try {
  $stage = "native-restore"
  $sendInvoked = $false
  $expectedInputs = $null
  $sentInputs = $null
  $cleanupExpected = $null
  $cleanupSent = $null
  $inputSize = [Runtime.InteropServices.Marshal]::SizeOf([type]'ClacklyShortcutSpike+INPUT')
  $expectedInputSize = if ([IntPtr]::Size -eq 8) { 40 } else { 28 }
  if ($inputSize -ne $expectedInputSize) { throw "Win32 INPUT layout is invalid" }
  $target = Get-ResolveTarget
  if ($env:CLACKLY_RESOLVE_SHORTCUT_MODE -eq "probe") {
    $foreground = [ClacklyShortcutSpike]::GetForegroundWindow()
    [pscustomobject]@{
      ok = $true; pid = [int]$target.Id; hwnd = [string]$target.MainWindowHandle;
      processName = $target.ProcessName; foregroundPid = [int](Get-ForegroundPid $foreground);
      foregroundHwnd = [string]$foreground.ToInt64(); keyboardLayout = Get-WindowKeyboardLayout $target.MainWindowHandle;
      inputSize = $inputSize
    } | ConvertTo-Json -Compress
    exit 0
  }

  if ($env:CLACKLY_RESOLVE_SHORTCUT_MODE -ne "send") { throw "Unsupported helper mode" }
  $expectedProcessId = [int]$env:CLACKLY_RESOLVE_SHORTCUT_PID
  $hwndValue = [int64]$env:CLACKLY_RESOLVE_SHORTCUT_HWND
  $expectedKeyboardLayout = [string]$env:CLACKLY_RESOLVE_SHORTCUT_LAYOUT
  if ($expectedKeyboardLayout -notmatch '^[a-f0-9]{16}$') { throw "Expected keyboard layout is invalid" }
  $window = [IntPtr]$hwndValue
  if ($target.Id -ne $expectedProcessId -or [int64]$target.MainWindowHandle -ne $hwndValue -or -not [ClacklyShortcutSpike]::IsWindow($window)) {
    throw "Resolve PID/HWND identity changed"
  }
  [void][ClacklyShortcutSpike]::ShowWindowAsync($window, 5)
  if (-not [ClacklyShortcutSpike]::SetForegroundWindow($window)) { throw "Could not restore Resolve foreground" }
  Start-Sleep -Milliseconds 50
  $foreground = [ClacklyShortcutSpike]::GetForegroundWindow()
  if ($foreground -ne $window -or (Get-ForegroundPid $foreground) -ne $expectedProcessId) { throw "Resolve foreground verification failed" }
  $held = @(16,17,18,91,92) | Where-Object { ([ClacklyShortcutSpike]::GetAsyncKeyState($_) -band 0x8000) -ne 0 }
  if ($held.Count -ne 0) { throw "Held modifier detected" }
  [uint16[]]$keys = @($env:CLACKLY_RESOLVE_SHORTCUT_KEYS -split "," | ForEach-Object { [uint16]$_ })
  if ($keys.Count -lt 1) { throw "Shortcut key sequence is invalid" }
  $inputs = New-Object 'ClacklyShortcutSpike+INPUT[]' ($keys.Count * 2)
  for ($i = 0; $i -lt $keys.Count; $i++) { $inputs[$i] = New-KeyInput $keys[$i] 0 }
  for ($i = 0; $i -lt $keys.Count; $i++) { $inputs[$keys.Count + $i] = New-KeyInput $keys[$keys.Count - 1 - $i] 2 }
  $foreground = [ClacklyShortcutSpike]::GetForegroundWindow()
  if ($foreground -ne $window -or (Get-ForegroundPid $foreground) -ne $expectedProcessId) { throw "Resolve foreground changed before SendInput" }
  $keyboardLayout = Get-WindowKeyboardLayout $window
  if ($keyboardLayout -ne $expectedKeyboardLayout) { throw "Resolve keyboard layout changed before SendInput" }
  $stage = "sendinput"
  $expectedInputs = [int]$inputs.Length
  $sendInvoked = $true
  $sent = [ClacklyShortcutSpike]::SendInput([uint32]$inputs.Length, $inputs, $inputSize)
  $sentInputs = [int]$sent
  if ($sent -ne $inputs.Length) {
    $cleanupExpected = [int]$keys.Count
    $released = Release-Keys $keys # cleanup only; never a semantic retry after a partial SendInput.
    $cleanupSent = [int]$released
    throw "SendInput sent $sent of $($inputs.Length) inputs; cleanup released $released of $($keys.Count) keys"
  }
  $stage = "complete"
  [pscustomobject]@{
    ok = $true; foregroundPid = $expectedProcessId; foregroundHwnd = [string]$hwndValue;
    keyboardLayout = $keyboardLayout; stage = $stage; sendInvoked = $sendInvoked;
    expectedInputs = $expectedInputs; sentInputs = $sentInputs;
    cleanupExpected = $cleanupExpected; cleanupSent = $cleanupSent
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{
    ok = $false; stage = $stage; sendInvoked = $sendInvoked;
    expectedInputs = $expectedInputs; sentInputs = $sentInputs;
    cleanupExpected = $cleanupExpected; cleanupSent = $cleanupSent;
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress
}
`;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, keys, name) {
  if (!isPlainObject(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error(`${name} has an invalid shape`);
  }
  return value;
}

function requireText(value, name, maximum = 160) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function parseChord(value) {
  const parts = requireText(value, "shortcut chord", 40).toUpperCase().split("+");
  if (parts.length < 1 || parts.some((part) => !part)) throw new Error("shortcut chord is unsupported");
  const codes = [];
  const seen = new Set();
  for (const part of parts) {
    let code = KEY_CODES[part];
    if (code === undefined && /^[A-Z]$/.test(part)) code = part.charCodeAt(0);
    if (code === undefined && /^\d$/.test(part)) code = part.charCodeAt(0);
    if (code === undefined && /^F([1-9]|1[0-2])$/.test(part)) code = 0x70 + Number(part.slice(1)) - 1;
    if (code === undefined || seen.has(code)) throw new Error("shortcut chord is unsupported");
    seen.add(code);
    codes.push(code);
  }
  const isSingleOrdinaryKey = codes.length === 1 && !MODIFIER_CODES.has(codes[0]);
  if (!isSingleOrdinaryKey && (!MODIFIER_CODES.has(codes[0]) || MODIFIER_CODES.has(codes.at(-1))
    || codes.slice(0, -1).some((code) => !MODIFIER_CODES.has(code)))) {
    throw new Error("shortcut chord must contain a modifier and one key");
  }
  return { canonical: parts.join("+"), keyCodes: codes };
}

function buildKeySequence(keyCodes) {
  return [
    ...keyCodes.map((keyCode) => ({ keyCode, type: "down" })),
    ...keyCodes.slice().reverse().map((keyCode) => ({ keyCode, type: "up" }))
  ];
}

function normalizeRequest(request, now = Date.now()) {
  requireExactKeys(request, ["action", "chord", "evidence"], "shortcut request");
  const actionId = requireText(request.action, "action", 40);
  const action = ACTIONS[actionId];
  if (!action) throw new Error("action is not an approved bound-shortcut experiment");
  const evidence = requireExactKeys(request.evidence, [
    "source", "confirmedAt", "resolveVersion", "preset", "keyboardLayout", "keyboardConfig", "context"
  ], "shortcut evidence");
  if (requireText(evidence.source, "evidence source", 80) !== "resolve-keyboard-customization") {
    throw new Error("shortcut binding must be confirmed in Resolve Keyboard Customization");
  }
  const confirmedAt = requireText(evidence.confirmedAt, "evidence confirmation", 40);
  const confirmedAtMs = Date.parse(confirmedAt);
  if (!Number.isFinite(confirmedAtMs) || new Date(confirmedAtMs).toISOString() !== confirmedAt) {
    throw new Error("evidence confirmation must be a canonical UTC ISO date");
  }
  if (!Number.isFinite(now) || confirmedAtMs < now - EVIDENCE_MAX_AGE_MS || confirmedAtMs > now + EVIDENCE_FUTURE_TOLERANCE_MS) {
    throw new Error("shortcut binding confirmation is stale");
  }
  const keyboardConfig = requireExactKeys(evidence.keyboardConfig, ["sha256", "mtimeMs"], "keyboard config evidence");
  const hash = requireText(keyboardConfig.sha256, "keyboard config hash", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isInteger(keyboardConfig.mtimeMs) || keyboardConfig.mtimeMs <= 0) {
    throw new Error("keyboard config evidence is invalid");
  }
  const context = requireExactKeys(evidence.context, [
    "projectId", "projectName", "timelineId", "timelineName", "page", "selectedClipCount", "selectedClipIds"
  ], "Resolve test context");
  const selectedClipCount = context.selectedClipCount;
  if (!Number.isInteger(selectedClipCount) || selectedClipCount < 0 || !action.selectedClipCount(selectedClipCount)) {
    throw new Error("Resolve selection does not meet this action's test context");
  }
  if (requireText(context.page, "Resolve page", 40) !== "edit") throw new Error("only the Edit page is supported");
  if (!Array.isArray(context.selectedClipIds) || context.selectedClipIds.length !== selectedClipCount) {
    throw new Error("selected clip identity evidence is invalid");
  }
  const selectedClipIds = context.selectedClipIds.map((id) => requireText(id, "selected clip identity", 200)).sort();
  if (new Set(selectedClipIds).size !== selectedClipIds.length) throw new Error("selected clip identity evidence is invalid");
  const keyboardLayout = requireText(evidence.keyboardLayout, "keyboard layout", 80).toLowerCase();
  if (!/^[a-f0-9]{16}$/.test(keyboardLayout)) throw new Error("keyboard layout evidence is invalid");
  return {
    actionId,
    action,
    chord: parseChord(request.chord),
    evidence: {
      confirmedAt,
      resolveVersion: requireText(evidence.resolveVersion, "Resolve version", 80),
      preset: requireText(evidence.preset, "Resolve preset", 160),
      keyboardLayout,
      keyboardConfig: { sha256: hash, mtimeMs: keyboardConfig.mtimeMs },
      context: {
        projectId: requireText(context.projectId, "test project identity", 200),
        projectName: requireText(context.projectName, "test project", 160),
        timelineId: requireText(context.timelineId, "test timeline identity", 200),
        timelineName: requireText(context.timelineName, "test timeline", 160),
        page: "edit",
        selectedClipCount,
        selectedClipIds
      }
    }
  };
}

async function callResolve(resolve, methodName, message) {
  if (!resolve || typeof resolve[methodName] !== "function") throw new Error(message);
  const result = await Promise.resolve(resolve[methodName]());
  if (result === null || result === undefined || result === false) throw new Error(message);
  return result;
}

async function readResolveContext(resolve) {
  const projectManager = await callResolve(resolve, "GetProjectManager", "Resolve project manager is unavailable");
  const project = await callResolve(projectManager, "GetCurrentProject", "No current Resolve project");
  const timeline = await callResolve(project, "GetCurrentTimeline", "No current Resolve timeline");
  const selectedClips = await callResolve(timeline, "GetSelectedClips", "Resolve selection is unavailable");
  if (!Array.isArray(selectedClips)) throw new Error("Resolve selection is unavailable");
  const selectedClipIds = (await Promise.all(selectedClips.map((clip) => (
    callResolve(clip, "GetUniqueId", "Resolve selected clip identity is unavailable")
  )))).map((id) => requireText(id, "Resolve selected clip identity", 200)).sort();
  if (new Set(selectedClipIds).size !== selectedClipIds.length) throw new Error("Resolve selected clip identity is ambiguous");
  return {
    resolveVersion: requireText(await callResolve(resolve, "GetVersionString", "Resolve version is unavailable"), "Resolve version"),
    preset: requireText(await callResolve(resolve, "GetCurrentKeyboardPreset", "Resolve preset is unavailable"), "Resolve preset"),
    page: requireText(await callResolve(resolve, "GetCurrentPage", "Resolve page is unavailable"), "Resolve page"),
    projectId: requireText(await callResolve(project, "GetUniqueId", "Resolve project identity is unavailable"), "Resolve project identity", 200),
    projectName: requireText(await callResolve(project, "GetName", "Resolve project name is unavailable"), "Resolve project name"),
    timelineId: requireText(await callResolve(timeline, "GetUniqueId", "Resolve timeline identity is unavailable"), "Resolve timeline identity", 200),
    timelineName: requireText(await callResolve(timeline, "GetName", "Resolve timeline name is unavailable"), "Resolve timeline name"),
    selectedClipCount: selectedClips.length,
    selectedClipIds
  };
}

async function readKeyboardConfig(environment = process.env) {
  const appData = requireText(environment.APPDATA, "APPDATA", 1000);
  const configPath = path.join(appData, ...KEYBOARD_CONFIG_PARTS);
  const [stats, body] = await Promise.all([fs.lstat(configPath), fs.readFile(configPath)]);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("Resolve keyboard configuration is not a regular file");
  return {
    path: configPath,
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    mtimeMs: Math.trunc(stats.mtimeMs)
  };
}

function runWindowsPowerShell(environment) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WINDOWS_HELPER
    ], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 8192,
      env: { ...process.env, ...environment }
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Windows shortcut helper failed: ${stderr || error.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (_error) {
        reject(new Error("Windows shortcut helper returned invalid telemetry"));
      }
    });
  });
}

function requireTelemetry(result, fields) {
  if (!isPlainObject(result) || result.ok !== true || fields.some((field) => !(field in result))) {
    throw new Error(isPlainObject(result) && typeof result.error === "string"
      ? `Windows shortcut helper refused: ${result.error}`
      : "Windows shortcut helper returned invalid telemetry");
  }
  return result;
}

function helperDiagnostic(result, expectedInputs) {
  const stage = isPlainObject(result) && ["native-restore", "sendinput", "complete"].includes(result.stage)
    ? result.stage
    : "native-restore";
  const count = (value, maximum) => Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
  const sendInvoked = isPlainObject(result) && typeof result.sendInvoked === "boolean"
    ? result.sendInvoked
    : null;
  return {
    stage,
    sendInvoked,
    expectedInputs,
    sentInputs: count(result?.sentInputs, expectedInputs),
    cleanupExpected: count(result?.cleanupExpected, expectedInputs),
    cleanupSent: count(result?.cleanupSent, expectedInputs)
  };
}

function attachShortcutDiagnostic(error, diagnostic) {
  error.shortcutDiagnostic = diagnostic;
  return error;
}

function createWindowsNativeShortcut({
  platform = process.platform,
  environment = process.env,
  run = runWindowsPowerShell,
  readConfig = () => readKeyboardConfig(environment)
} = {}) {
  if (platform !== "win32") throw new Error("Resolve bound-shortcut spike is Windows-only");
  return {
    readConfig,
    async discoverResolveWindow() {
      const result = requireTelemetry(await run({ CLACKLY_RESOLVE_SHORTCUT_MODE: "probe" }), ["pid", "hwnd", "processName", "keyboardLayout", "inputSize"]);
      if (!Number.isInteger(result.pid) || result.pid <= 0 || !/^\d+$/.test(String(result.hwnd)) || result.processName.toLowerCase() !== "resolve"
        || !/^[a-f0-9]{16}$/.test(result.keyboardLayout) || ![28, 40].includes(result.inputSize)) {
        throw new Error("Windows shortcut helper returned an invalid Resolve target");
      }
      return { pid: result.pid, hwnd: String(result.hwnd), processName: "Resolve", keyboardLayout: result.keyboardLayout };
    },
    async restoreAndSend({ target, keyboardLayout, keyCodes, sequence }) {
      if (!target || !Number.isInteger(target.pid) || !/^\d+$/.test(String(target.hwnd)) || !/^[a-f0-9]{16}$/.test(keyboardLayout)
        || !Array.isArray(keyCodes) || !Array.isArray(sequence) || sequence.length !== keyCodes.length * 2) {
        throw new Error("Resolve shortcut request is invalid");
      }
      const result = await run({
        CLACKLY_RESOLVE_SHORTCUT_MODE: "send",
        CLACKLY_RESOLVE_SHORTCUT_PID: String(target.pid),
        CLACKLY_RESOLVE_SHORTCUT_HWND: String(target.hwnd),
        CLACKLY_RESOLVE_SHORTCUT_LAYOUT: keyboardLayout,
        CLACKLY_RESOLVE_SHORTCUT_KEYS: keyCodes.join(",")
      });
      const diagnostic = helperDiagnostic(result, sequence.length);
      if (!isPlainObject(result) || result.ok !== true) {
        throw attachShortcutDiagnostic(
          new Error(isPlainObject(result) && typeof result.error === "string"
            ? `Windows shortcut helper refused: ${result.error}`
            : "Windows shortcut helper returned invalid telemetry"),
          diagnostic
        );
      }
      requireTelemetry(result, ["foregroundPid", "foregroundHwnd", "keyboardLayout", "sentInputs"]);
      if (result.foregroundPid !== target.pid || String(result.foregroundHwnd) !== String(target.hwnd)
        || result.keyboardLayout !== keyboardLayout || result.sentInputs !== sequence.length
        || diagnostic.stage !== "complete" || diagnostic.sendInvoked !== true) {
        throw attachShortcutDiagnostic(new Error("Windows shortcut helper did not verify the complete key sequence"), diagnostic);
      }
      return {
        foregroundPid: result.foregroundPid,
        foregroundHwnd: String(result.foregroundHwnd),
        sentInputs: result.sentInputs,
        diagnostic
      };
    }
  };
}

function assertCurrentEvidence(evidence, current, config) {
  if (current.resolveVersion !== evidence.resolveVersion || current.preset !== evidence.preset || current.page !== "edit"
    || current.projectId !== evidence.context.projectId || current.projectName !== evidence.context.projectName
    || current.timelineId !== evidence.context.timelineId || current.timelineName !== evidence.context.timelineName
    || current.selectedClipCount !== evidence.context.selectedClipCount
    || current.selectedClipIds.length !== evidence.context.selectedClipIds.length
    || current.selectedClipIds.some((id, index) => id !== evidence.context.selectedClipIds[index])) {
    throw new Error("Resolve test context or preset changed; do not send keys");
  }
  if (config.sha256 !== evidence.keyboardConfig.sha256 || config.mtimeMs !== evidence.keyboardConfig.mtimeMs) {
    throw new Error("Resolve keyboard configuration changed; reconfirm the shortcut in Resolve");
  }
}

async function collectBoundShortcutEvidence({ getResolve, native }) {
  const resolve = await getResolve();
  const [context, keyboardConfig, target] = await Promise.all([
    readResolveContext(resolve),
    native.readConfig(),
    native.discoverResolveWindow()
  ]);
  return {
    resolveVersion: context.resolveVersion,
    preset: context.preset,
    keyboardLayout: target.keyboardLayout,
    keyboardConfig: { sha256: keyboardConfig.sha256, mtimeMs: keyboardConfig.mtimeMs },
    context: {
      projectId: context.projectId,
      projectName: context.projectName,
      timelineId: context.timelineId,
      timelineName: context.timelineName,
      page: context.page,
      selectedClipCount: context.selectedClipCount,
      selectedClipIds: context.selectedClipIds
    }
  };
}

function createExperimentalBoundShortcutSpike({
  getResolve,
  closePalette,
  native = createWindowsNativeShortcut(),
  ShortcutManagerType = ShortcutManager,
  now = Date.now
} = {}) {
  if (typeof getResolve !== "function" || typeof closePalette !== "function") {
    throw new TypeError("Resolve bound-shortcut spike requires Resolve and palette callbacks");
  }
  let running = false;
  return {
    collectEvidence() {
      return collectBoundShortcutEvidence({ getResolve, native });
    },
    async execute(request) {
      if (running) throw new Error("Resolve bound-shortcut spike is already running");
      running = true;
      let helperEntered = false;
      let diagnostic = {
        stage: "preflight",
        sendInvoked: false,
        expectedInputs: null,
        sentInputs: null,
        cleanupExpected: null,
        cleanupSent: null
      };
      try {
        const normalized = normalizeRequest(request, now());
        const resolve = await getResolve();
        const [current, config] = await Promise.all([readResolveContext(resolve), native.readConfig()]);
        assertCurrentEvidence(normalized.evidence, current, config);
        const target = await native.discoverResolveWindow();
        if (target.keyboardLayout !== normalized.evidence.keyboardLayout) {
          throw new Error("Resolve keyboard layout changed; reconfirm the shortcut in Resolve");
        }
        const sequence = buildKeySequence(normalized.chord.keyCodes);
        diagnostic.expectedInputs = sequence.length;
        const shortcutManager = new ShortcutManagerType({
          shortcuts: { [normalized.action.functionName]: normalized.chord.canonical },
          keyboardExecutor: {
            execute: () => {
              helperEntered = true;
              return native.restoreAndSend({
                target,
                keyboardLayout: normalized.evidence.keyboardLayout,
                keyCodes: normalized.chord.keyCodes,
                sequence
              });
            }
          }
        });
        await Promise.resolve(closePalette());
        diagnostic.stage = "palette-hidden";
        const [freshCurrent, freshConfig] = await Promise.all([readResolveContext(resolve), native.readConfig()]);
        diagnostic.stage = "posthide-guard";
        assertCurrentEvidence(normalized.evidence, freshCurrent, freshConfig);
        diagnostic.stage = "native-restore";
        const transport = await shortcutManager.execute(normalized.action.functionName, {
          action: normalized.actionId,
          evidence: normalized.evidence
        });
        diagnostic = { ...diagnostic, ...transport.diagnostic };
        if (helperEntered && !transport.diagnostic) diagnostic.sendInvoked = null;
        return {
          action: normalized.actionId,
          transport,
          diagnostic: { ...diagnostic, helperEntered },
          postconditionRequired: true,
          // ponytail: manual panel focus evidence only; add a supported focus oracle if Resolve exposes one.
          limitation: "Foreground PID/HWND does not prove the intended Resolve child panel owns keyboard focus."
        };
      } catch (error) {
        const nativeDiagnostic = error.shortcutDiagnostic;
        diagnostic = { ...diagnostic, ...nativeDiagnostic };
        if (helperEntered && !nativeDiagnostic) diagnostic.sendInvoked = null;
        error.shortcutDiagnostic = { ...diagnostic, helperEntered };
        error.transportAttempted = helperEntered;
        throw error;
      } finally {
        running = false;
      }
    }
  };
}

module.exports = {
  ACTIONS,
  WINDOWS_HELPER,
  buildKeySequence,
  createExperimentalBoundShortcutSpike,
  createWindowsNativeShortcut,
  collectBoundShortcutEvidence,
  normalizeRequest,
  parseChord,
  readKeyboardConfig
};
