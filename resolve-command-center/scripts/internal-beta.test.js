const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const betaBuilder = require("./package-internal-beta");

const appRoot = path.resolve(__dirname, "..");
const templateRoot = path.join(__dirname, "internal-beta");
const modulePath = path.join(templateRoot, "ClacklyInstaller.psm1");
// Inert bytes are used only through an explicit module-level test provider.
const fixtureNative = Buffer.from("INERT TEST NATIVE - NEVER LOAD");
// PowerShell's filesystem provider returns long FullName paths; normalize the
// fixture base once so complete retained-path assertions do not compare 8.3 aliases.
const temporaryRoot = fs.realpathSync.native(os.tmpdir());

function powerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runPowerShell(script) {
  const result = childProcess.spawnSync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")
  ], { encoding: "utf8" });
  return result;
}

function invokeModule({ packageRoot, pluginRoot, processState = "closed", failurePoint = "", mutationPoint = "", uninstall = false }) {
  const entry = uninstall ? "Invoke-ClacklyUninstallTransaction" : "Invoke-ClacklyInstallTransaction";
  const packageArgument = uninstall ? "" : `$package = Test-ClacklyPackage -PackageRoot ${powerShellLiteral(packageRoot)}; `;
  const failurePoints = Array.isArray(failurePoint) ? failurePoint : [failurePoint];
  const mutation = mutationPoint
    ? `if ($point -eq ${powerShellLiteral(mutationPoint)}) { ${mutationPoint === "before-backup"
      ? `$stages = @(Get-ChildItem -LiteralPath (Get-ClacklyTransactionRoot -PluginRoot ${powerShellLiteral(pluginRoot)}) -Force -Directory -ErrorAction Stop | Where-Object { $_.Name -like '.com.wutpeach.clackly.stage.*' }); if ($stages.Count -ne 1) { throw 'expected exactly one transaction stage' }; $mutationRoot = $stages[0].FullName;`
      : `$mutationRoot = ${powerShellLiteral(path.join(pluginRoot, "com.wutpeach.clackly"))};` } [System.IO.File]::AppendAllText((Join-Path $mutationRoot 'manifest.xml'), 'tampered') }`
    : "";
  const injector = failurePoints.filter(Boolean).length || mutation
    ? `-FailureInjector { param($point) ${mutation} if (@(${failurePoints.filter(Boolean).map(powerShellLiteral).join(",")}) -contains $point) { throw 'injected failure' } }`
    : "";
  const provision = uninstall ? "" : "-Provision { param($root) $file=Join-Path $root 'workflow-plugin/WorkflowIntegration.node'; [IO.File]::WriteAllText($file,'INERT TEST NATIVE - NEVER LOAD'); @{path='workflow-plugin/WorkflowIntegration.node';size=(Get-Item -LiteralPath $file).Length;sha256=([BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([IO.File]::ReadAllBytes($file)))).Replace('-','').ToLowerInvariant()} }";
  const script = [
    '$WarningPreference = "SilentlyContinue";',
    '$ProgressPreference = "SilentlyContinue";',
    `$ErrorActionPreference = 'Stop'; Import-Module ${powerShellLiteral(modulePath)} -Force;`,
    packageArgument,
    `$result = ${entry} ${uninstall ? "" : "-Package $package "}-PluginRoot ${powerShellLiteral(pluginRoot)} -ProcessState ${powerShellLiteral(processState)} ${injector} ${provision};`,
    "$result | ConvertTo-Json -Compress"
  ].join(" ");
  const result = runPowerShell(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed=JSON.parse(result.stdout.trim());
  return parsed;
}

function preflightFailureCode(packageRoot) {
  const script = [
    "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue';",
    `Import-Module ${powerShellLiteral(modulePath)} -Force;`,
    `try { Test-ClacklyPackage -PackageRoot ${powerShellLiteral(packageRoot)} | Out-Null; 'ok' } catch { [string]$_.Exception.Data['ClacklyExitCode'] }`
  ].join(" ");
  const result = runPowerShell(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runProductionEntryPreflight(entryPath) {
  const result = runPowerShell(`$ErrorActionPreference = 'Stop'; & ${powerShellLiteral(entryPath)}; exit $LASTEXITCODE`);
  return result.status;
}

function createFixture(root, version = "0.1.0") {
  const packageRoot = path.join(root, "内测 package & space");
  const payloadApp = path.join(packageRoot, "payload", "win-unpacked", "resources", "app");
  const runtimeRoot = path.join(packageRoot, "payload", "win-unpacked", "resources", "runtimes");
  fs.mkdirSync(path.join(payloadApp, "workflow-plugin"), { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.writeFileSync(path.join(payloadApp, "manifest.xml"), `<?xml version="1.0"?><BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>${version}</Version></Plugin></BlackmagicDesign>`, "utf8");
  fs.writeFileSync(path.join(payloadApp, "package.json"), JSON.stringify({ name: "clackly", version }), "utf8");
  fs.writeFileSync(path.join(payloadApp, "workflow-plugin", "main.js"), "module.exports = {};", "utf8");
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), JSON.stringify({ schemaVersion: 1, profiles: [{ id: "fixture" }] }), "utf8");
  for (const file of ["安装 Clackly.bat", "卸载 Clackly.bat", "README.txt"]) fs.copyFileSync(path.join(templateRoot, file), path.join(packageRoot, file));
  const tools = path.join(packageRoot, "tools");
  fs.mkdirSync(tools);
  for (const file of ["Install-Clackly.ps1", "Uninstall-Clackly.ps1", "ClacklyInstaller.psm1"]) fs.copyFileSync(path.join(templateRoot, file), path.join(tools, file));
  for (const file of ["WorkflowTransaction.psm1", "LocalNative.psm1"]) fs.copyFileSync(path.join(__dirname, "workflow-update", file), path.join(tools, file));
  betaBuilder.writeHashManifest(packageRoot);
  betaBuilder.verifyHashManifest(packageRoot);
  return packageRoot;
}

function createPackagedBuilderFixture(root, packagedVersion = "0.1.0") {
  const sourceRoot = path.join(root, "source");
  const packageRoot = path.join(root, "win-unpacked");
  const appRoot = path.join(packageRoot, "resources", "app");
  const runtimeRoot = path.join(packageRoot, "resources", "runtimes");
  fs.mkdirSync(path.join(appRoot, "workflow-plugin"), { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.writeFileSync(path.join(sourceRoot, "package.json"), JSON.stringify({ name: "clackly", version: "0.1.0" }), "utf8");
  fs.writeFileSync(path.join(sourceRoot, "manifest.xml"), "<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.1.0</Version></Plugin></BlackmagicDesign>", "utf8");
  fs.writeFileSync(path.join(appRoot, "package.json"), JSON.stringify({ name: "clackly", version: packagedVersion }), "utf8");
  fs.writeFileSync(path.join(appRoot, "manifest.xml"), `<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>${packagedVersion}</Version></Plugin></BlackmagicDesign>`, "utf8");
  fs.writeFileSync(path.join(appRoot, "workflow-plugin", "main.js"), "module.exports = {};", "utf8");
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), JSON.stringify({ schemaVersion: 1, profiles: [{ id: "fixture" }] }), "utf8");
  fs.mkdirSync(path.join(sourceRoot, "scripts", "workflow-update"), { recursive: true });
  for (const file of ["WorkflowTransaction.psm1", "LocalNative.psm1"]) fs.copyFileSync(path.join(__dirname, "workflow-update", file), path.join(sourceRoot, "scripts", "workflow-update", file));
  return { sourceRoot, packageRoot, appRoot };
}

function readInstalledVersion(pluginRoot) {
  return /<Version>([^<]+)<\/Version>/.exec(fs.readFileSync(path.join(pluginRoot, "com.wutpeach.clackly", "manifest.xml"), "utf8"))[1];
}

function transactionRoot(pluginRoot) {
  return path.join(path.dirname(pluginRoot), `${path.basename(pluginRoot)}.Clackly Transactions`);
}

function ownedPaths(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => /^\.com\.wutpeach\.clackly\.(?:stage|backup|failed|uninstall)\.[0-9a-f]{32}$/i.test(name))
    .map((name) => path.join(root, name))
    .sort();
}

function transactionPaths(pluginRoot) {
  return ownedPaths(transactionRoot(pluginRoot));
}

// Observe the same direct-child manifests that Resolve can register; dot names
// are intentionally included, independent of our transaction naming helpers.
function scannedPlugins(pluginRoot) {
  if (!fs.existsSync(pluginRoot)) return [];
  return fs.readdirSync(pluginRoot).flatMap((name) => {
    const manifest = path.join(pluginRoot, name, "manifest.xml");
    if (!fs.existsSync(manifest)) return [];
    const id = /<Id>([^<]+)<\/Id>/.exec(fs.readFileSync(manifest, "utf8"));
    return id ? [{ name, id: id[1] }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function transactionPathNames(pluginRoot) {
  return transactionPaths(pluginRoot).map((candidate) => path.basename(candidate)).sort();
}

function retainedPathNames(result) {
  return [...result.RetainedPaths].map((candidate) => path.basename(candidate)).sort();
}

test("internal Beta builder rejects unsafe relative hash paths and verifies a Unicode fixture inventory", () => {
  assert.throws(() => betaBuilder.assertSafeRelativePath("../payload/app"), /Unsafe distribution path/);
  assert.throws(() => betaBuilder.assertSafeRelativePath("C:/payload/app"), /Unsafe distribution path/);
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-builder-"));
  try {
    fs.mkdirSync(path.join(root, "工具"));
    fs.writeFileSync(path.join(root, "工具", "文件.txt"), "verified", "utf8");
    betaBuilder.writeHashManifest(root);
    assert.equal(betaBuilder.verifyHashManifest(root).length, 1);
    fs.writeFileSync(path.join(root, "工具", "文件.txt"), "changed", "utf8");
    assert.throws(() => betaBuilder.verifyHashManifest(root), /SHA256SUMS verification failed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta builder composes the existing Windows package and verification commands", () => {
  const calls = [];
  betaBuilder.runExistingPackage({
    runner(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    }
  });
  assert.deepEqual(calls.map(({ args }) => args), [["run", "package:win"], ["run", "package:verify"]]);
  assert.equal(calls.every(({ options }) => options.cwd === appRoot && options.stdio === "inherit"), true);
  assert.equal(calls.every(({ options }) => options.shell === (process.platform === "win32")), true);
});

test("internal Beta builder rejects identity drift and verifies an extracted ZIP", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-archive-"));
  try {
    const { sourceRoot, packageRoot, appRoot } = createPackagedBuilderFixture(root, "0.1.1");
    assert.throws(() => betaBuilder.assertPackageIdentity({ appRoot: sourceRoot, packageRoot }), /authorities disagree/);
    fs.writeFileSync(path.join(appRoot, "package.json"), JSON.stringify({ name: "clackly", version: "0.1.0" }), "utf8");
    fs.writeFileSync(path.join(appRoot, "manifest.xml"), "<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.1.0</Version></Plugin></BlackmagicDesign>", "utf8");
    fs.writeFileSync(path.join(appRoot, "workflow-plugin", "WorkflowIntegration.node"), fixtureNative);
    assert.throws(() => betaBuilder.assertPackageIdentity({ appRoot: sourceRoot, packageRoot }), /forbidden in distribution/);
    fs.unlinkSync(path.join(appRoot, "workflow-plugin", "WorkflowIntegration.node"));
      const outputRoot = path.join(root, "output");
    assert.throws(() => betaBuilder.assertContained(outputRoot, path.join(outputRoot, "..", "escape")), /escapes its owned root/);
    const distribution = betaBuilder.createDistribution({ appRoot: sourceRoot, packageRoot, outputRoot, templateRoot });
    const zip = betaBuilder.createAndVerifyZip(distribution);
    assert.equal(fs.existsSync(zip.zipPath), true);
    assert.equal(zip.size > 0, true);

    const unsafeOutputRoot = path.join(root, "unsafe-output");
    fs.mkdirSync(unsafeOutputRoot);
    fs.symlinkSync(outputRoot, path.join(unsafeOutputRoot, "Clackly-Beta-0.1.0-win-x64"), "junction");
    assert.throws(() => betaBuilder.createDistribution({ appRoot: sourceRoot, packageRoot, outputRoot: unsafeOutputRoot, templateRoot }), /Owned Beta output is unsafe/);

    const danglingOutputRoot = path.join(root, "dangling-output");
    fs.mkdirSync(danglingOutputRoot);
    fs.symlinkSync(path.join(root, "missing-output"), path.join(danglingOutputRoot, "Clackly-Beta-0.1.0-win-x64"), "dir");
    assert.throws(() => betaBuilder.createDistribution({ appRoot: sourceRoot, packageRoot, outputRoot: danglingOutputRoot, templateRoot }), /Owned Beta output is unsafe/);

    const unsafeSource = createPackagedBuilderFixture(path.join(root, "unsafe-source"));
    const preservedOutputRoot = path.join(root, "preserved-output");
    const preservedDirectory = path.join(preservedOutputRoot, "Clackly-Beta-0.1.0-win-x64");
    const preservedZip = path.join(preservedOutputRoot, "Clackly-Beta-0.1.0-win-x64.zip");
    fs.mkdirSync(preservedDirectory, { recursive: true });
    fs.writeFileSync(path.join(preservedDirectory, "sentinel.txt"), "keep-directory", "utf8");
    fs.writeFileSync(preservedZip, "keep-zip", "utf8");
    fs.symlinkSync(path.join(unsafeSource.packageRoot, "resources", "runtimes"), path.join(unsafeSource.packageRoot, "unsafe-link"), "junction");
    assert.throws(() => betaBuilder.createDistribution({ appRoot: unsafeSource.sourceRoot, packageRoot: unsafeSource.packageRoot, outputRoot: preservedOutputRoot, templateRoot }), /Distribution entry is unsafe/);
    assert.equal(fs.readFileSync(path.join(preservedDirectory, "sentinel.txt"), "utf8"), "keep-directory");
    assert.equal(fs.readFileSync(preservedZip, "utf8"), "keep-zip");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta package transaction stages, reinstalls, upgrades, rolls back, and preserves user data", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-transaction-"));
  try {
    const pluginRoot = path.join(root, "Workflow Integration Plugins");
    const appDataSentinel = path.join(root, "AppData", "Clackly", "settings-sentinel.txt");
    fs.mkdirSync(path.dirname(appDataSentinel), { recursive: true });
    fs.writeFileSync(appDataSentinel, "preserve me", "utf8");
    const older = createFixture(path.join(root, "older"), "0.0.9");
    const current = createFixture(path.join(root, "current"), "0.1.0");

    assert.equal(invokeModule({ packageRoot: older, pluginRoot }).Code, 0);
    assert.equal(readInstalledVersion(pluginRoot), "0.0.9");
    assert.equal(invokeModule({ packageRoot: current, pluginRoot }).Code, 0, "upgrade succeeds");
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0");
    assert.equal(invokeModule({ packageRoot: current, pluginRoot }).Code, 0, "same-version reinstall succeeds");
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0");
    assert.equal(fs.readFileSync(appDataSentinel, "utf8"), "preserve me");

    const cleanupFailure = invokeModule({ packageRoot: current, pluginRoot, failurePoint: "cleanup" });
    assert.equal(cleanupFailure.Code, 18, "post-commit cleanup failure is distinct from activation failure");
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "cleanup failure retains the verified active target");
    assert.deepEqual(scannedPlugins(pluginRoot), [{ name: "com.wutpeach.clackly", id: "com.wutpeach.clackly" }], "retained backup cannot register as a second plugin");
    assert.equal(fs.readFileSync(appDataSentinel, "utf8"), "preserve me");

    const failedUpgrade = createFixture(path.join(root, "failed"), "0.1.1");
    const stagedHashDrift = invokeModule({ packageRoot: failedUpgrade, pluginRoot, mutationPoint: "before-backup" });
    assert.equal(stagedHashDrift.Code, 16, "staged hash drift is caught by active-tree verification");
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "staged hash drift restores the exact prior target");
    const beforeBackup = invokeModule({ packageRoot: failedUpgrade, pluginRoot, failurePoint: "before-backup" });
    assert.equal(beforeBackup.Code, 16);
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "failure before backup leaves the active target untouched");
    const afterBackup = invokeModule({ packageRoot: failedUpgrade, pluginRoot, failurePoint: "after-backup" });
    assert.equal(afterBackup.Code, 16);
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "failure after backup restores the exact prior target");
    const rollback = invokeModule({ packageRoot: failedUpgrade, pluginRoot, failurePoint: "after-activation" });
    assert.equal(rollback.Code, 16);
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "activation failure restored the exact prior target");
    const activeHashDrift = invokeModule({ packageRoot: failedUpgrade, pluginRoot, mutationPoint: "after-activation" });
    assert.equal(activeHashDrift.Code, 16, "active hash drift is rejected and rolled back");
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "active hash drift restores the exact prior target");
    const activeVerificationFailure = invokeModule({ packageRoot: failedUpgrade, pluginRoot, failurePoint: "after-verify" });
    assert.equal(activeVerificationFailure.Code, 16);
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "post-activation verification failure restores the exact prior target");
    assert.equal(fs.readFileSync(appDataSentinel, "utf8"), "preserve me");

    const rollbackFailure = invokeModule({ packageRoot: failedUpgrade, pluginRoot, failurePoint: ["after-activation", "before-restore"] });
    assert.equal(rollbackFailure.Code, 17, "rollback failure has a distinct truthful result");
    assert.equal(fs.existsSync(path.join(pluginRoot, "com.wutpeach.clackly")), false);
    assert.equal(rollbackFailure.RetainedPaths.length, 2, "both the failed candidate and backup are retained on restore failure");
    assert.deepEqual(scannedPlugins(pluginRoot), [], "failed activation and backup stay outside the scan after rollback failure");
    assert.equal(retainedPathNames(rollbackFailure).every((name) => transactionPathNames(pluginRoot).includes(name)), true);

    const running = invokeModule({ packageRoot: failedUpgrade, pluginRoot: path.join(root, "running"), processState: "running" });
    assert.equal(running.Code, 12, "Resolve-running refusal happens before a target exists");
    assert.equal(fs.existsSync(path.join(root, "running", "com.wutpeach.clackly")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta rejects reparse package and plugin-root ancestors before any transaction mutation", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-ancestor-"));
  try {
    const packageRoot = createFixture(path.join(root, "package-backing"));
    const packageLinkParent = path.join(root, "package-link-parent");
    const packageLink = path.join(packageLinkParent, "package root");
    fs.mkdirSync(packageLinkParent);
    fs.symlinkSync(packageRoot, packageLink, "junction");
    assert.equal(preflightFailureCode(packageLink), "10", "package-root junction is rejected before traversal");
    assert.equal(runProductionEntryPreflight(path.join(packageLink, "tools", "Install-Clackly.ps1")), 10, "installer entry rejects a package-root junction before UAC");
    assert.equal(runProductionEntryPreflight(path.join(packageLink, "tools", "Uninstall-Clackly.ps1")), 10, "uninstaller entry rejects a package-root junction before UAC");

    const backingRoot = path.join(root, "plugin-backing");
    const linkedRoot = path.join(root, "plugin root junction");
    const sibling = path.join(backingRoot, "com.example.sibling", "sentinel.txt");
    fs.mkdirSync(path.dirname(sibling), { recursive: true });
    fs.writeFileSync(sibling, "preserve sibling", "utf8");
    fs.symlinkSync(backingRoot, linkedRoot, "junction");
    assert.equal(invokeModule({ packageRoot, pluginRoot: linkedRoot }).Code, 14, "install rejects a plugin-root junction before staging");
    assert.deepEqual(transactionPaths(backingRoot), []);
    assert.equal(fs.readFileSync(sibling, "utf8"), "preserve sibling");

    assert.equal(invokeModule({ packageRoot, pluginRoot: backingRoot }).Code, 0, "normal backing root can receive the fixture");
    assert.equal(invokeModule({ pluginRoot: linkedRoot, uninstall: true }).Code, 14, "uninstall rejects a plugin-root junction before tombstone creation");
    assert.equal(fs.existsSync(path.join(backingRoot, "com.wutpeach.clackly")), true);
    assert.deepEqual(transactionPaths(backingRoot), []);
    assert.equal(fs.readFileSync(sibling, "utf8"), "preserve sibling");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta reports every surviving rollback or cleanup transaction path", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-remnants-"));
  try {
    const base = createFixture(path.join(root, "base"), "0.1.0");
    const next = createFixture(path.join(root, "next"), "0.1.1");
    for (const [name, failurePoint, expectedCode] of [
      ["cleanup", "cleanup", 18],
      ["failed-cleanup", ["after-activation", "before-failed-cleanup"], 17],
      ["stage-cleanup", ["before-backup", "before-stage-cleanup"], 17],
      ["restore", ["after-activation", "before-restore"], 17]
    ]) {
      const pluginRoot = path.join(root, name, "plugins");
      assert.equal(invokeModule({ packageRoot: base, pluginRoot }).Code, 0);
      const result = invokeModule({ packageRoot: next, pluginRoot, failurePoint });
      assert.equal(result.Code, expectedCode, `${name} has its distinct truthful result`);
      assert.deepEqual(retainedPathNames(result), transactionPathNames(pluginRoot), `${name} reports every surviving task-owned path`);
      assert.deepEqual([...result.RetainedPaths].sort(), transactionPaths(pluginRoot), `${name} reports exact full survivor paths`);
      assert.deepEqual(scannedPlugins(pluginRoot), name === "restore" ? [] : [{ name: "com.wutpeach.clackly", id: "com.wutpeach.clackly" }], `${name} never exposes a transaction plugin ID to Resolve`);
      assert.equal(result.RetainedPaths.every((candidate) => fs.existsSync(candidate)), true);
      if (name === "cleanup") assert.equal(readInstalledVersion(pluginRoot), "0.1.1", "cleanup failure retains the verified new active plugin");
      if (name === "failed-cleanup") assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "failed-candidate cleanup failure restores the prior plugin");
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function createLegacyTransaction(pluginRoot, kind = "backup", token = "1", id = "com.wutpeach.clackly") {
  const legacy = path.join(pluginRoot, `.com.wutpeach.clackly.${kind}.${token.repeat(32)}`);
  fs.mkdirSync(legacy, { recursive: true });
  // A partially deleted backup can still have its manifest but no package/main.
  fs.writeFileSync(path.join(legacy, "manifest.xml"), `<BlackmagicDesign><Plugin><Id>${id}</Id><Version>0.0.9</Version></Plugin></BlackmagicDesign>`, "utf8");
  fs.writeFileSync(path.join(legacy, "sentinel.txt"), `${kind} retained data`, "utf8");
  return legacy;
}

test("internal Beta relocates only identified exact legacy names, preserving partial backups and siblings", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-legacy-"));
  try {
    const packageRoot = createFixture(path.join(root, "package"));
    for (const uninstall of [false, true]) {
      const pluginRoot = path.join(root, uninstall ? "uninstall" : "install", "plugins");
      assert.equal(invokeModule({ packageRoot, pluginRoot }).Code, 0);
      const legacy = ["stage", "backup", "failed", "uninstall"].map((kind, index) => createLegacyTransaction(pluginRoot, kind, String(index + 1)));
      const untouched = ["com.example.sibling", ".com.wutpeach.clackly.backup.not-a-guid", `.com.wutpeach.clackly.backup.${"a".repeat(32)}.extra`];
      for (const name of untouched) {
        fs.mkdirSync(path.join(pluginRoot, name));
        fs.writeFileSync(path.join(pluginRoot, name, "sentinel.txt"), "preserve unrelated data", "utf8");
      }
      assert.equal(scannedPlugins(pluginRoot).length, 5, "dot-prefixed old manifests are scan-visible before repair");
      const result = invokeModule({ packageRoot, pluginRoot, uninstall });
      assert.equal(result.Code, 0, result.Message);
      assert.equal(result.RetainedPaths.length, 4, "all legacy data is archived and reported even on success");
      assert.deepEqual([...result.RetainedPaths].sort(), transactionPaths(pluginRoot));
      assert.deepEqual(scannedPlugins(pluginRoot), uninstall ? [] : [{ name: "com.wutpeach.clackly", id: "com.wutpeach.clackly" }]);
      assert.equal(legacy.every((candidate) => !fs.existsSync(candidate)), true);
      const sentinels = result.RetainedPaths.map((candidate) => fs.readFileSync(path.join(candidate, "sentinel.txt"), "utf8")).sort();
      assert.deepEqual(sentinels, ["stage", "backup", "failed", "uninstall"].map((kind) => `${kind} retained data`).sort());
      for (const name of untouched) assert.equal(fs.readFileSync(path.join(pluginRoot, name, "sentinel.txt"), "utf8"), "preserve unrelated data");
      assert.equal(invokeModule({ packageRoot, pluginRoot, uninstall }).Code, 0, "later runs preserve prior archives without touching them");
      for (const candidate of result.RetainedPaths) assert.equal(fs.existsSync(candidate), true);
    }
    const absentRoot = path.join(root, "absent-active", "plugins");
    createLegacyTransaction(absentRoot);
    const absentUninstall = invokeModule({ pluginRoot: absentRoot, uninstall: true });
    assert.equal(absentUninstall.Code, 0);
    assert.equal(absentUninstall.RetainedPaths.length, 1, "idempotent uninstall still removes an identified legacy plugin from the scan");
    assert.deepEqual(scannedPlugins(absentRoot), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta legacy migration fails closed for unidentified, foreign and linked artifacts", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-unsafe-legacy-"));
  try {
    const packageRoot = createFixture(path.join(root, "package"));
    const external = path.join(root, "external");
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, "sentinel.txt"), "external data", "utf8");
    for (const scenario of ["foreign", "missing-manifest", "malformed", "multiple-ids", "file", "junction", "nested-junction", "dangling-link"]) {
      const pluginRoot = path.join(root, scenario, "plugins");
      assert.equal(invokeModule({ packageRoot, pluginRoot }).Code, 0);
      const good = createLegacyTransaction(pluginRoot, "stage", "2");
      const unsafe = createLegacyTransaction(pluginRoot, "backup", "1", scenario === "foreign" ? "com.example.foreign" : "com.wutpeach.clackly");
      if (scenario === "missing-manifest") fs.unlinkSync(path.join(unsafe, "manifest.xml"));
      if (scenario === "malformed") fs.writeFileSync(path.join(unsafe, "manifest.xml"), "not XML");
      if (scenario === "multiple-ids") fs.writeFileSync(path.join(unsafe, "manifest.xml"), "<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Id>com.example.foreign</Id><Version>0.0.9</Version></Plugin></BlackmagicDesign>");
      if (scenario === "file" || scenario === "junction" || scenario === "dangling-link") {
        fs.rmSync(unsafe, { recursive: true });
        if (scenario === "file") fs.writeFileSync(unsafe, "foreign file");
        else fs.symlinkSync(scenario === "junction" ? external : path.join(root, "missing-backing"), unsafe, scenario === "junction" ? "junction" : "dir");
      }
      if (scenario === "nested-junction") fs.symlinkSync(external, path.join(unsafe, "linked"), "junction");
      for (const uninstall of [false, true]) {
        const result = invokeModule({ packageRoot, pluginRoot, uninstall });
        assert.equal(result.Code, 14, `${scenario} is refused: ${result.Message}`);
        assert.deepEqual([...result.RetainedPaths].sort(), [good, unsafe].sort(), `${scenario} reports every unmoved exact-name artifact`);
        assert.equal(result.RetainedPath, result.RetainedPaths[0]);
        assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "active target is untouched on unsafe migration");
        assert.deepEqual(transactionPaths(pluginRoot), [], "validate all artifacts before relocating any");
        assert.equal(fs.readFileSync(path.join(good, "sentinel.txt"), "utf8"), "stage retained data");
        assert.equal(fs.readFileSync(path.join(external, "sentinel.txt"), "utf8"), "external data");
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta reports relocated archives together with later install failure survivors", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-migration-failure-"));
  try {
    const packageRoot = createFixture(path.join(root, "package"));
    for (const [name, failurePoint, code, expectedScanCount] of [
      ["before-relocation", "before-legacy-relocation", 15, 2],
      ["after-relocation", "after-legacy-relocation", 15, 1],
      ["activation", "after-activation", 16, 1],
      ["rollback", ["after-activation", "before-restore"], 17, 0],
      ["cleanup", "cleanup", 18, 1]
    ]) {
      const pluginRoot = path.join(root, name, "plugins");
      assert.equal(invokeModule({ packageRoot, pluginRoot }).Code, 0);
      createLegacyTransaction(pluginRoot);
      const result = invokeModule({ packageRoot, pluginRoot, failurePoint });
      assert.equal(result.Code, code, result.Message);
      assert.deepEqual([...result.RetainedPaths].sort(), [...ownedPaths(pluginRoot), ...transactionPaths(pluginRoot)].sort());
      assert.equal(scannedPlugins(pluginRoot).length, expectedScanCount, `${name} has only the expected scan-visible manifests`);
      assert.equal(result.RetainedPaths.every((candidate) => fs.existsSync(candidate)), true);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta refuses linked or file transaction roots before moving an active plugin", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-transaction-root-"));
  try {
    const packageRoot = createFixture(path.join(root, "package"));
    const external = path.join(root, "external");
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, "sentinel.txt"), "keep");
    for (const kind of ["junction", "dangling", "file"]) {
      const pluginRoot = path.join(root, kind, "plugins");
      assert.equal(invokeModule({ packageRoot, pluginRoot }).Code, 0);
      fs.rmdirSync(transactionRoot(pluginRoot));
      if (kind === "file") fs.writeFileSync(transactionRoot(pluginRoot), "foreign");
      else fs.symlinkSync(kind === "junction" ? external : path.join(root, "missing-root"), transactionRoot(pluginRoot), kind === "junction" ? "junction" : "dir");
      for (const uninstall of [false, true]) {
        assert.equal(invokeModule({ packageRoot, pluginRoot, uninstall }).Code, 14);
        assert.equal(readInstalledVersion(pluginRoot), "0.1.0");
        assert.deepEqual(scannedPlugins(pluginRoot), [{ name: "com.wutpeach.clackly", id: "com.wutpeach.clackly" }]);
        assert.equal(fs.readFileSync(path.join(external, "sentinel.txt"), "utf8"), "keep");
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta production-default process checks refuse running or unknown Resolve before staging", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-process-default-"));
  try {
    const packageRoot = createFixture(path.join(root, "package"));
    for (const uninstall of [false, true]) {
      for (const state of ["running", "indeterminate"]) {
        const pluginRoot = path.join(root, `${uninstall}-${state}`, "plugins");
        if (uninstall) assert.equal(invokeModule({ packageRoot, pluginRoot }).Code, 0);
        const script = [
          `$ErrorActionPreference = 'Stop'; $module = Import-Module ${powerShellLiteral(modulePath)} -Force -PassThru;`,
          `$package = Test-ClacklyPackage -PackageRoot ${powerShellLiteral(packageRoot)};`,
          `$result = & $module { param($package, $pluginRoot) function Get-ClacklyResolveState { return ${powerShellLiteral(state)} };`,
          uninstall ? "Invoke-ClacklyUninstallTransaction -PluginRoot $pluginRoot" : "Invoke-ClacklyInstallTransaction -Package $package -PluginRoot $pluginRoot",
          `} $package ${powerShellLiteral(pluginRoot)}; $result | ConvertTo-Json -Compress`
        ].join(" ");
        const process = runPowerShell(script);
        assert.equal(process.status, 0, process.stderr || process.stdout);
        const result = JSON.parse(process.stdout.trim());
        assert.equal(result.Code, 12, `${state} is queried and refused with no explicit ProcessState`);
        assert.deepEqual(result.RetainedPaths, []);
        assert.deepEqual(transactionPaths(pluginRoot), [], "no transaction artifact was created");
        if (uninstall) assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "uninstall process gate preserves active target");
        else {
          assert.equal(fs.existsSync(pluginRoot), false, "process gate precedes plugin root creation");
          assert.equal(fs.existsSync(transactionRoot(pluginRoot)), false, "process gate precedes transaction root creation");
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta stage allocation failure preserves the original active plugin", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-stage-allocation-"));
  try {
    const packageRoot = createFixture(path.join(root, "package"));
    const pluginRoot = path.join(root, "plugins");
    assert.equal(invokeModule({ packageRoot, pluginRoot }).Code, 0);
    const sentinel = path.join(pluginRoot, "com.wutpeach.clackly", "original-sentinel.txt");
    fs.writeFileSync(sentinel, "original installation");
    const script = [
      "$ErrorActionPreference = 'Stop';",
      `$module = Import-Module ${powerShellLiteral(modulePath)} -Force -PassThru;`,
      `$package = Test-ClacklyPackage -PackageRoot ${powerShellLiteral(packageRoot)};`,
      "$result = & $module { param($package, $pluginRoot) $originalAllocate = ${function:New-ClacklyTransactionPath}; function New-ClacklyTransactionPath { param($Parent, $Kind) if ($Kind -eq 'stage') { throw 'Simulated stage allocation failure' }; & $originalAllocate -Parent $Parent -Kind $Kind };",
      "Invoke-ClacklyInstallTransaction -Package $package -PluginRoot $pluginRoot -ProcessState closed",
      `} $package ${powerShellLiteral(pluginRoot)}; $result | ConvertTo-Json -Compress`
    ].join(" ");
    const process = runPowerShell(script);
    assert.equal(process.status, 0, process.stderr || process.stdout);
    const result = JSON.parse(process.stdout.trim());
    assert.equal(result.Code, 16);
    assert.equal(readInstalledVersion(pluginRoot), "0.1.0");
    assert.equal(fs.readFileSync(sentinel, "utf8"), "original installation");
    assert.deepEqual(scannedPlugins(pluginRoot), [{ name: "com.wutpeach.clackly", id: "com.wutpeach.clackly" }]);
    assert.deepEqual(result.RetainedPaths, []);
    assert.deepEqual(transactionPaths(pluginRoot), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta rejects corrupt inventories and reparse package entries before mutation", (t) => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-preflight-"));
  try {
    const changed = createFixture(path.join(root, "changed"));
    fs.appendFileSync(path.join(changed, "README.txt"), "tampered", "utf8");
    assert.equal(preflightFailureCode(changed), "10");

    const extra = createFixture(path.join(root, "extra"));
    fs.writeFileSync(path.join(extra, "unexpected.txt"), "not listed", "utf8");
    assert.equal(preflightFailureCode(extra), "10", "unlisted package content is rejected before mutation");

    for (const [name, manifest] of [
      ["malformed", "not a hash manifest\n"],
      ["traversal", `${"A".repeat(64)}  ../README.txt\n`],
      ["case-collision", `${"A".repeat(64)}  README.txt\n${"A".repeat(64)}  readme.txt\n`]
    ]) {
      const fixture = createFixture(path.join(root, name));
      fs.writeFileSync(path.join(fixture, "SHA256SUMS.txt"), manifest, "utf8");
      assert.equal(preflightFailureCode(fixture), "10", `${name} inventory is rejected before mutation`);
    }

    const reparse = createFixture(path.join(root, "reparse"));
    const linkedTarget = path.join(reparse, "payload", "win-unpacked", "resources", "app", "linked-runtime");
    try {
      fs.symlinkSync(path.join(reparse, "payload", "win-unpacked", "resources", "runtimes"), linkedTarget, "junction");
    } catch (error) {
      t.skip(`junction creation is unavailable: ${error.code || error.message}`);
      return;
    }
    assert.equal(preflightFailureCode(reparse), "10");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta transaction refuses downgrade and unsafe targets, then uninstalls the exact target only", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly-beta-uninstall-"));
  try {
    const pluginRoot = path.join(root, "plugins");
    const higher = createFixture(path.join(root, "higher"), "0.2.0");
    const lower = createFixture(path.join(root, "lower"), "0.1.0");
    assert.equal(invokeModule({ packageRoot: higher, pluginRoot }).Code, 0);
    assert.equal(invokeModule({ packageRoot: lower, pluginRoot }).Code, 14);
    assert.equal(readInstalledVersion(pluginRoot), "0.2.0");

    const sibling = path.join(pluginRoot, "com.example.sibling");
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, "keep.txt"), "sibling", "utf8");
    assert.equal(invokeModule({ pluginRoot, uninstall: true }).Code, 0);
    assert.equal(fs.existsSync(path.join(pluginRoot, "com.wutpeach.clackly")), false);
    assert.equal(fs.readFileSync(path.join(sibling, "keep.txt"), "utf8"), "sibling");
    assert.equal(invokeModule({ pluginRoot, uninstall: true }).Code, 0, "missing target uninstall is idempotent");

    const incompleteUninstallRoot = path.join(root, "incomplete-uninstall");
    assert.equal(invokeModule({ packageRoot: lower, pluginRoot: incompleteUninstallRoot }).Code, 0);
    const incompleteUninstall = invokeModule({ pluginRoot: incompleteUninstallRoot, uninstall: true, failurePoint: "after-uninstall-rename" });
    assert.equal(incompleteUninstall.Code, 18, "uninstall cleanup failure is explicit");
    assert.equal(fs.existsSync(path.join(incompleteUninstallRoot, "com.wutpeach.clackly")), false);
    assert.equal(fs.existsSync(incompleteUninstall.RetainedPath), true, "only the task-owned uninstall tombstone remains");
    assert.deepEqual(scannedPlugins(incompleteUninstallRoot), [], "uninstall cleanup failure leaves no registered Clackly manifest");
    assert.deepEqual(incompleteUninstall.RetainedPaths, transactionPaths(incompleteUninstallRoot));

    const unsafeRoot = path.join(root, "unsafe");
    fs.mkdirSync(unsafeRoot, { recursive: true });
    fs.writeFileSync(path.join(unsafeRoot, "com.wutpeach.clackly"), "foreign");
    assert.equal(invokeModule({ packageRoot: lower, pluginRoot: unsafeRoot }).Code, 14);

    const corruptRoot = path.join(root, "corrupt");
    assert.equal(invokeModule({ packageRoot: lower, pluginRoot: corruptRoot }).Code, 0);
    fs.writeFileSync(path.join(corruptRoot, "com.wutpeach.clackly", "manifest.xml"), "not a workflow manifest", "utf8");
    assert.equal(invokeModule({ packageRoot: lower, pluginRoot: corruptRoot }).Code, 14, "an existing corrupt plugin directory is unsafe, not absent");
    assert.equal(invokeModule({ pluginRoot: corruptRoot, uninstall: true }).Code, 14, "uninstall also refuses a corrupt target");

    const reparseRoot = path.join(root, "reparse-target");
    const reparseBacking = path.join(root, "reparse-backing");
    fs.mkdirSync(reparseRoot, { recursive: true });
    fs.mkdirSync(reparseBacking, { recursive: true });
    fs.symlinkSync(reparseBacking, path.join(reparseRoot, "com.wutpeach.clackly"), "junction");
    assert.equal(invokeModule({ packageRoot: lower, pluginRoot: reparseRoot }).Code, 14, "a reparse target is unsafe, not absent");
    assert.equal(invokeModule({ pluginRoot: reparseRoot, uninstall: true }).Code, 14, "uninstall refuses the same reparse target");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta thin BAT wrappers preserve quoted PowerShell entry points and user-facing exit messages", () => {
  const installBat = fs.readFileSync(path.join(templateRoot, "安装 Clackly.bat"), "utf8");
  const uninstallBat = fs.readFileSync(path.join(templateRoot, "卸载 Clackly.bat"), "utf8");
  for (const content of [installBat, uninstallBat]) {
    assert.match(content, /%~dp0tools\\/);
    assert.match(content, /-File "%SCRIPT%"/);
    assert.match(content, /exit \/b %CLACKLY_EXIT%/);
    assert.doesNotMatch(content, /Copy-Item|Remove-Item/);
  }
  for (const scriptName of ["Install-Clackly.ps1", "Uninstall-Clackly.ps1"]) {
    const content = fs.readFileSync(path.join(templateRoot, scriptName), "utf8");
    assert.match(content, /New-ClacklyElevationArgumentList -ScriptPath \$PSCommandPath/);
    assert.match(content, /Start-Process -FilePath \(Get-ClacklyWindowsPowerShellExecutable\) -Verb RunAs -Wait -PassThru/);
    assert.match(content, /foreach \(\$retainedPath in @\(\$result\.RetainedPaths\)\)/);
    assert.doesNotMatch(content, /Quote-ClacklyPowerShellArgument/);
    assert.match(content, /Get-ClacklyProductionPluginRoot/);
    assert.match(content, /exit \[int\]\$_\.Exception\.Data\["ClacklyExitCode"\]/);
  }
  assert.doesNotMatch(fs.readFileSync(modulePath, "utf8"), /Stop-Process/);
});

test("internal Beta elevation arguments preserve a quoted Unicode path and child exit code without UAC", () => {
  const root = fs.mkdtempSync(path.join(temporaryRoot, "clackly beta 中文 & apostrophe-"));
  try {
    const scriptPath = path.join(root, "child's elevated script.ps1");
    const markerPath = path.join(root, "elevated.txt");
    fs.writeFileSync(scriptPath, "param([switch]$Elevated) if (!$Elevated) { exit 91 }; [System.IO.File]::WriteAllText($env:CLACKLY_ELEVATION_TEST_MARKER, [string]$Elevated); exit 23", "utf8");
    const script = [
      "$ErrorActionPreference = 'Stop';",
      `Import-Module ${powerShellLiteral(modulePath)} -Force;`,
      `$env:CLACKLY_ELEVATION_TEST_MARKER = ${powerShellLiteral(markerPath)};`,
      `$arguments = New-ClacklyElevationArgumentList -ScriptPath ${powerShellLiteral(scriptPath)};`,
      "$child = Start-Process -FilePath (Get-ClacklyWindowsPowerShellExecutable) -ArgumentList $arguments -Wait -PassThru;",
      "[pscustomobject]@{ ExitCode = $child.ExitCode; Arguments = $arguments } | ConvertTo-Json -Compress"
    ].join(" ");
    const result = runPowerShell(script);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const child = JSON.parse(result.stdout.trim());
    assert.equal(child.ExitCode, 23);
    assert.equal(fs.readFileSync(markerPath, "utf8"), "True");
    assert.match(child.Arguments, /-File ".+child's elevated script\.ps1" -Elevated$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta production entries print retained archives on both success and failure", () => {
  for (const scriptName of ["Install-Clackly.ps1", "Uninstall-Clackly.ps1"]) {
    const content = fs.readFileSync(path.join(templateRoot, scriptName), "utf8");
    // Execute only the production result rendering block: no preflight, UAC or
    // install entry is run, but the output comes from the actual consumer code.
    const outputBlock = content.slice(content.indexOf("  Write-Host $result.Message"), content.indexOf("  exit $result.Code"));
    assert.notEqual(outputBlock, "");
    for (const success of [true, false]) {
      const script = `$result = [pscustomobject]@{ Success = $${success}; Message = 'fixture result'; RetainedPaths = @('D:\fixture 中文\archive-1', 'D:\fixture 中文\archive-2') }; ${outputBlock}`;
      const result = runPowerShell(script);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /fixture result/);
      assert.match(result.stdout, /Retained transaction path: D:\fixture 中文\archive-1/);
      assert.match(result.stdout, /Retained transaction path: D:\fixture 中文\archive-2/);
    }
  }
});


test("internal Beta rejects native bytes anywhere in a hash-consistent package", () => {
  const root=fs.mkdtempSync(path.join(temporaryRoot,"clackly-beta-native-policy-"));
  try {
    const packageRoot=createFixture(root);
    const native=path.join(packageRoot,"payload","win-unpacked","resources","app","other","workflowintegration.NODE");
    fs.mkdirSync(path.dirname(native),{recursive:true}); fs.writeFileSync(native,fixtureNative);
    betaBuilder.writeHashManifest(packageRoot);
    assert.equal(preflightFailureCode(packageRoot),"10");
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
