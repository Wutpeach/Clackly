const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const sampler = require("./package-diagnostic-sampler");
const { RuntimeProbeCache, RuntimeDiagnostics } = require("../script-runtime/runtime/probe");
const samplerRoot = path.join(__dirname, "diagnostic-sampler");
const script = path.join(samplerRoot, "Collect-ClacklyDiagnostics.ps1");

function hasPowerShell() {
  return !childProcess.spawnSync("powershell.exe", ["-NoProfile", "-Command", "exit 0"], { encoding: "utf8" }).error;
}

function ps(value) { return `'${String(value).replaceAll("'", "''")}'`; }

test("diagnostic sampler summarizes real producer Probe caches and preserves unreadable evidence states", (t) => {
  if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-probe-summary-"));
  try {
    const passedPath = path.join(root, "passed.json");
    const bridge = { modulePath: path.join(root, "DaVinciResolveScript.py"), libraryPath: path.join(root, "fusionscript.dll") };
    const runtime = { id: "python-cpython-3.14.4-resolve-21.1-win32-x64", version: "3.14.4", architecture: "x64", executable: path.join(root, "python.exe") };
    const result = { ...RuntimeDiagnostics.derive("machine-verified", "passed"), runtime, resolve: { version: "21.1.0.14", connected: true }, bridge };
    new RuntimeProbeCache({ filePath: passedPath }).save({
      clacklyVersion: "0.1.0", runtime: { id: runtime.id, version: runtime.version, executableMtimeMs: 1 },
      resolveVersion: result.resolve.version, bridge: { ...bridge, moduleMtimeMs: 1, libraryMtimeMs: 1 },
      platform: "win32", architecture: "x64", overridePath: null
    }, result);
    const failedPath = path.join(root, "failed.json");
    fs.writeFileSync(failedPath, JSON.stringify({ schemaVersion: 1, result: RuntimeDiagnostics.derive("machine-verified", "failed") }));
    const invalidPath = path.join(root, "invalid.json");
    fs.writeFileSync(invalidPath, "{ invalid JSON");
    const incompletePath = path.join(root, "incomplete.json");
    fs.writeFileSync(incompletePath, JSON.stringify({ schemaVersion: 1, result: {} }));
    const paths = [passedPath, failedPath, invalidPath, incompletePath, path.join(root, "missing.json")];
    // Load just the summary definitions, never the interactive sampler entrypoint.
    const command = [
      "Set-StrictMode -Version Latest; $ErrorActionPreference = 'Stop'",
      "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
      "Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility') -Force",
      "$tokens = $null; $errors = $null",
      `$ast = [System.Management.Automation.Language.Parser]::ParseFile(${ps(script)}, [ref]$tokens, [ref]$errors)`,
      "if (@($errors).Count) { throw 'Sampler parse failed' }",
      "foreach ($statement in $ast.EndBlock.Statements) { if ($statement -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $statement.Name -in @('New-Result', 'Redact-DiagnosticText', 'Get-ProbeCacheSummary')) { Invoke-Expression $statement.Extent.Text } }",
      `@(${paths.map((file, index) => `Get-ProbeCacheSummary -Path ${ps(file)} -Name 'case-${index}'`).join('; ')}) | ConvertTo-Json -Depth 6 -Compress`
    ].join('; ');
    const collected = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(collected.status, 0, collected.stderr || collected.stdout);
    const summaries = JSON.parse(collected.stdout.trim());
    assert.equal(summaries[0].status, "ok", summaries[0].detail);
    assert.deepEqual(summaries[0].data, { schemaVersion: 1, resultStatus: "passed" });
    assert.equal(summaries[1].status, "ok");
    assert.equal(summaries[1].data.resultStatus, "failed");
    assert.equal(summaries[2].status, "error");
    assert.equal(summaries[3].status, "error");
    assert.equal(summaries[4].status, "missing");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const scenario of ['host-custom', 'host-ambiguous', 'host-unreadable-image', 'host-missing-library', 'host-stale-record', 'host-invalid-record', 'host-invalid-path', 'host-oversized-record', 'host-redacted', 'host-denied-library', 'host-denied-record']) {
  test('diagnostic sampler current-host paths and bounded records: ' + scenario, (t) => {
    if (!hasPowerShell()) return t.skip('Windows PowerShell is unavailable');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clackly-host-evidence-'));
    try {
      const result = childProcess.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'diagnostic-sampler-orchestration.test.ps1'), '-SamplerPath', script, '-FixtureRoot', root, '-Scenario', scenario], { encoding: 'utf8', timeout: 30000, windowsHide: true });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
      assert.match(report.powerShell, /^5\.1\./);
      assert.equal(report.exitCode, 0);
      assert.equal(report.recoveryExists, false);
      assert.match(report.cacheText, /original simulation/);
      assert.equal(report.normalEntries.some((entry) => /\.dmp$|dumps-sensitive/i.test(entry)), false);
      const observation = report.manifest.results.find((item) => item.name === 'observed-resolve-installation');
      assert.equal(observation.status, scenario === 'host-ambiguous' ? 'ambiguous' : scenario === 'host-unreadable-image' ? 'unresolved' : 'ok');
      assert.equal(observation.data.observedRootCount, scenario === 'host-ambiguous' ? 2 : scenario === 'host-unreadable-image' ? 0 : 1);
      const evidence = JSON.stringify(report.recordEvidence.map((text) => JSON.parse(text)));
      assert.doesNotMatch(evidence, /PRIVATE_CONFIG|PRIVATE_JSX|PRIVATE_MESSAGE|PRIVATE_METADATA|PRIVATE_MEDIA|PRIVATE_JSON_INVALID|PRIVATE_OVERSIZED/);
      assert.doesNotMatch(JSON.stringify(report.manifest), /PRIVATE_/);
      const diagnostic = report.manifest.results.find((item) => item.name === 'runtime-diagnostic');
      assert.equal(diagnostic.status, 'ok');
      assert.equal(diagnostic.data.code, 'RESOLVE_LIBRARY_NOT_FOUND');
      assert.equal(diagnostic.data.stage, 'installation-discovery');
      assert.match(diagnostic.data.time, /^2026-10-08T08:01:00/);
      const installation = report.manifest.results.find((item) => item.name === 'resolve-installation');
      const invalid = ['host-invalid-record', 'host-oversized-record', 'host-denied-record'].includes(scenario);
      assert.equal(installation.status, scenario === 'host-denied-record' ? 'denied' : invalid ? 'error' : 'ok');
      assert.equal(report.normalEntries.includes('resolve-installation.json'), !invalid);
      assert.equal(report.normalEntries.includes('runtime-diagnostic.json'), true);
      if (scenario === 'host-unreadable-image') {
        assert.equal(observation.data.unresolvedImageCount, 1);
        assert.equal(observation.data.installations.length, 0);
        return;
      }
      for (const installed of observation.data.installations) {
        const executable = installed.files.find((file) => file.label === 'observed-resolve/Resolve.exe');
        assert.equal(executable.status, 'ok');
        assert.match(executable.sha256, /^[A-F0-9]{64}$/);
      }
      const selected = observation.data.installations.find((item) => item.resolveRoot.includes('21'));
      const library = selected.files.find((file) => file.label === 'observed-resolve/fusionscript.dll');
      assert.equal(library.status, scenario === 'host-missing-library' ? 'missing' : scenario === 'host-denied-library' ? 'denied' : 'ok');
      if (library.status === 'ok') assert.equal(library.sha256, crypto.createHash('sha256').update('SIMULATION current host library').digest('hex').toUpperCase());
      assert.equal(selected.recordMatchesObservation, !invalid && !['host-stale-record', 'host-invalid-path'].includes(scenario));
      if (scenario === 'host-invalid-path') {
        assert.equal(Object.hasOwn(installation.data, 'resolveExecutable'), false);
        assert.equal(report.manifest.results.some((item) => item.name === 'sampling'), false);
        assert.ok(report.normalEntries.includes('logs/clackly.log'));
      }
      if (selected.recordMatchesObservation) {
        const module = selected.files.find((file) => file.label === 'resolve-module/DaVinciResolveScript.py');
        assert.equal(module.status, 'ok');
        assert.equal(module.sha256, crypto.createHash('sha256').update('SIMULATION scripting wrapper').digest('hex').toUpperCase());
        assert.equal(installation.data.files.modulePath.size, 28);
      }
      if (scenario === 'host-redacted') {
        assert.match(evidence, /<USERPROFILE>/);
        assert.match(installation.data.resolveExecutable, /^<USERPROFILE>/);
        assert.match(diagnostic.data.modulePath, /^<USERPROFILE>/);
        assert.match(selected.files[0].path, /^<USERPROFILE>/);
        assert.match(report.sourceInstallation, /PRIVATE_CONFIG/);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

for (const scenario of ["absent-prior-conflict", "post-copy-failure", "partial-recovery", "pending-partial-recovery", "uac-rejected", "uac-forward"]) {
  test("diagnostic sampler recovery and entry regression: " + scenario, (t) => {
    if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-review-"));
    try {
      const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "diagnostic-sampler-recovery.test.ps1"), "-SamplerPath", script, "-FixtureRoot", root, "-Scenario", scenario], { encoding: "utf8", timeout: 30000, windowsHide: true });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
      assert.equal(report.exitCode, scenario === "uac-forward" ? 7 : scenario === "uac-rejected" ? 0 : 1);
      if (scenario === "absent-prior-conflict") {
        assert.match(report.cacheText, /foreign cache/);
        assert.equal(report.recoveryExists, true);
        assert.equal(report.manifest.recovery.status, "error");
      }
      if (scenario === "post-copy-failure") {
        assert.match(report.cacheText, /"new"/);
        assert.equal(report.quarantineCount, 1);
        assert.equal(report.recoveryExists, true);
        assert.equal(report.manifest.results.find((item) => item.name === "probe-cache-restore").status, "error");
      }
      if (["partial-recovery", "pending-partial-recovery"].includes(scenario)) {
        assert.match(report.cacheText, /"original"/);
        assert.equal(report.journalBeforeRetry.state, null);
        assert.ok(report.journalBeforeRetry.werSnapshot);
        assert.equal(report.retry.status, "ok");
        assert.equal(report.recoveryExists, false);
      }
      if (scenario.startsWith("uac-")) {
        assert.equal(report.launch.file.toLowerCase(), path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe").toLowerCase());
        assert.equal(report.launch.verb, "RunAs");
        assert.equal(report.launch.wait && report.launch.passThru, true);
        assert.equal(report.launch.arguments, `-NoProfile -ExecutionPolicy Bypass -File "${script}" -Elevated -EnableDumps -OutputRoot "${fs.realpathSync.native(path.join(root, "output with spaces"))}"`);
      }
      if (scenario === "uac-rejected") {
        const wer = report.manifest.results.find((item) => item.name === "wer-dump");
        assert.equal(wer.status, "skipped");
        assert.match(wer.detail, /SIMULATED_UAC_DECLINED_1223/);
        assert.match(result.stdout, /\[skipped\] wer-dump.*SIMULATED_UAC_DECLINED_1223/);
        assert.match(result.stdout, /\[error\] installation.*Simulated installation access failure/);
        assert.equal(report.recoveryExists, false);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

for (const scenario of ["ordinary", "absent-cache", "dump", "empty-dump", "wer-failure", "previous-recovery-failure", "restore-failure", "normal-zip-failure", "dump-zip-failure"]) {
  test("diagnostic sampler real orchestration: " + scenario + " (simulated host/dumps/HKCU)", (t) => {
    if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-orchestration-"));
    try {
      const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "diagnostic-sampler-orchestration.test.ps1"), "-SamplerPath", script, "-FixtureRoot", root, "-Scenario", scenario], { encoding: "utf8", timeout: 30000, windowsHide: true });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
      assert.match(report.powerShell, /^5\.1\./);
      const failed = ["previous-recovery-failure", "restore-failure", "normal-zip-failure", "dump-zip-failure"].includes(scenario);
      assert.equal(report.exitCode, failed ? 1 : 0);
      assert.equal(report.requiresElevation, false);
      assert.equal(report.ordinaryCount, scenario === "normal-zip-failure" ? 0 : 1);
      assert.equal(report.sensitiveCount, scenario === "dump" ? 1 : 0);
      assert.equal(report.registryRestored, true);
      const recoveryFailure = ["previous-recovery-failure", "restore-failure"].includes(scenario);
      assert.equal(report.recoveryExists, recoveryFailure);
      assert.equal(report.quarantineCount, recoveryFailure ? 1 : 0);
      if (scenario === "absent-cache") assert.equal(report.cacheExists, false);
      else if (scenario === "previous-recovery-failure") assert.match(report.cacheText, /foreign simulation/);
      else if (scenario === "restore-failure") assert.match(report.cacheText, /new simulation/);
      else assert.match(report.cacheText, /original simulation/);
      assert.equal(report.normalEntries.some((entry) => /\.dmp$|dumps-sensitive/i.test(entry)), false);
      if (scenario !== "normal-zip-failure") assert.ok(report.normalEntries.includes("manifest.json"));
      if (scenario === "dump") assert.deepEqual(report.dumpEntries.sort(), ["dumps-sensitive/DUMP-PRIVACY.txt", "dumps-sensitive/simulated-python.dmp"]);
      if (scenario === "previous-recovery-failure") assert.equal(report.manifest.recovery.status, "error");
      else {
        const results = report.manifest.results;
        assert.equal(results.find((item) => item.name === "installation").status, "error");
        assert.equal(results.find((item) => item.name === "python-observation").status, "missing");
        assert.equal(results.some((item) => item.name === "sampling"), false);
        assert.equal(results.find((item) => item.name === "probe-cache-after").status, "ok");
        assert.equal(results.find((item) => item.name === "probe-cache-after").data.resultStatus, "passed");
        const before = results.find((item) => item.name === "probe-cache-before");
        if (scenario === "absent-cache") assert.equal(before.status, "missing");
        else {
          assert.equal(before.status, "ok");
          assert.equal(before.data.resultStatus, "passed");
        }
        assert.equal(report.manifest.environmentOverrides.length, 3);
        assert.ok(report.normalEntries.includes("runtime-probe-after.json") || scenario === "normal-zip-failure");
        if (scenario !== "absent-cache" && scenario !== "normal-zip-failure") assert.ok(report.normalEntries.includes("runtime-probe-before.json"));
        if (scenario === "wer-failure") assert.equal(results.find((item) => item.name === "wer-dump").status, "error");
        if (scenario === "absent-cache") assert.equal(results.find((item) => item.name === "process-observation").status, "missing");
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test("diagnostic sampler hashes the ABI DLL for both installed Runtime profiles", (t) => {
  if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-profile-evidence-"));
  try {
    const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "diagnostic-sampler-orchestration.test.ps1"), "-SamplerPath", script, "-FixtureRoot", root, "-Scenario", "profiles"], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const evidence = JSON.parse(result.stdout.trim());
    const resolver = evidence.files.find((item) => item.label === "plugin/script-runtime/runtime/resolver.js");
    assert.equal(resolver.status, "ok");
    assert.equal(resolver.sha256, crypto.createHash("sha256").update("SIMULATION resolver").digest("hex").toUpperCase());
    for (const [version, dll] of [["3.13.14", "python313.dll"], ["3.14.4", "python314.dll"]]) {
      const file = evidence.files.find((item) => item.label === "runtime/" + dll);
      assert.equal(file.status, "ok", JSON.stringify(file));
      assert.match(file.path, new RegExp(version.replaceAll(".", "\\.")));
      assert.equal(file.sha256, crypto.createHash("sha256").update("SIMULATION dll " + version).digest("hex").toUpperCase());
    }
    assert.equal(evidence.files.filter((item) => item.label === "runtime/python.exe" && item.status === "ok").length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("diagnostic sampler self-check protects cache/registry evidence and separates dumps", (t) => {
  if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-SelfTest"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.deepEqual(report, {
    redactionCaseInsensitive: true,
    cacheParsed: true,
    cacheRestored: true,
    collisionPreserved: true,
    registryConfigured: true,
    registryRestored: true,
    werFailureContinues: true,
    samplerExcluded: true,
    processDeduplicated: true,
    failureContinues: true,
    normalExcludesDump: true,
    dumpSeparate: true
  });
});

test("diagnostic sampler package is a standalone three-file ZIP", (t) => {
  if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-diagnostic-package-"));
  try {
    const result = sampler.buildDiagnosticSampler({ outputRoot: root });
    assert.equal(fs.existsSync(result.zipPath), true);
    assert.deepEqual(fs.readdirSync(result.output).sort(), [...sampler.FILES].sort());
    assert.equal(fs.statSync(result.zipPath).size > 0, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("diagnostic sampler keeps its extracted launcher ASCII-only and self-testable from a Chinese path", (t) => {
  if (!hasPowerShell()) return t.skip("Windows PowerShell is unavailable");
  const entryBytes = fs.readFileSync(path.join(samplerRoot, "Start-Clackly-Diagnostics.cmd"));
  const implementationBytes = fs.readFileSync(script);
  const entry = entryBytes.toString("ascii");
  const implementation = implementationBytes.toString("utf8");
  assert.equal([...entryBytes].every((byte) => byte < 0x80), true);
  assert.deepEqual([...implementationBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(entry, /-File "%SCRIPT%" %\*/);
  assert.match(entry, /if \/I "%~1"=="-SelfTest" exit \/b %CLACKLY_EXIT%/);
  assert.match(entry, /pause/);
  assert.match(entry, /exit \/b %CLACKLY_EXIT%/);
  assert.match(implementation, /Get-CimInstance Win32_Process/);
  assert.doesNotMatch(implementation, /Stop-Process/);
  assert.doesNotMatch(implementation, /Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer|curl\.exe/);
  assert.match(implementation, /LocalDumps\\python\.exe/);
  assert.match(implementation, /DUMPS-SENSITIVE/);
  assert.doesNotMatch(implementation, /\$commandLine -match "\(\?i\)clackly\|resolve2ae\|afterfx"/);

  const backupFunction = implementation.slice(implementation.indexOf("function Backup-ProbeCache"), implementation.indexOf("function Restore-ProbeCache"));
  assert.ok(backupFunction.indexOf("Write-RecoveryJournal") < backupFunction.indexOf("Move-Item"));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Clackly diagnostic "));
  const extractedRoot = path.join(root, "中文 路径");
  try {
    const archive = sampler.buildDiagnosticSampler({ outputRoot: root });
    const extract = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath ${ps(archive.zipPath)} -DestinationPath ${ps(extractedRoot)} -Force`], { encoding: "utf8" });
    assert.equal(extract.status, 0, extract.stderr || extract.stdout);
    const extractedEntry = path.join(extractedRoot, path.basename(archive.output), "Start-Clackly-Diagnostics.cmd");
    assert.equal(fs.existsSync(extractedEntry), true);
    const runner = path.join(root, "run-extracted-self-test.cmd");
    fs.writeFileSync(runner, "@echo off\r\nfor /d %%D in (\"%~dp0*\") do call \"%%~fD\\Clackly-Diagnostic-Sampler\\Start-Clackly-Diagnostics.cmd\" -SelfTest\r\n", "ascii");
    const launched = childProcess.spawnSync("cmd.exe", ["/d", "/c", runner], { encoding: "utf8", windowsHide: true });
    assert.equal(launched.status, 0, launched.stderr || launched.stdout);
    assert.match(launched.stdout, /"cacheRestored":true/);

    const brokenRoot = path.join(root, "broken launcher");
    fs.mkdirSync(brokenRoot);
    fs.copyFileSync(path.join(samplerRoot, "Start-Clackly-Diagnostics.cmd"), path.join(brokenRoot, "Start-Clackly-Diagnostics.cmd"));
    const failed = childProcess.spawnSync("cmd.exe", ["/d", "/c", path.join(brokenRoot, "Start-Clackly-Diagnostics.cmd"), "-SelfTest"], { encoding: "utf8", windowsHide: true });
    assert.notEqual(failed.status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
