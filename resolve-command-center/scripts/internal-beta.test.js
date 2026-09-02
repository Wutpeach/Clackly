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
const qualifiedNode = path.join(appRoot, "workflow-plugin", "WorkflowIntegration.node");

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
      ? `$stages = @(Get-ChildItem -LiteralPath ${powerShellLiteral(pluginRoot)} -Force -Directory -ErrorAction Stop | Where-Object { $_.Name -like '.com.wutpeach.clackly.stage.*' }); if ($stages.Count -ne 1) { throw 'expected exactly one transaction stage' }; $mutationRoot = $stages[0].FullName;`
      : `$mutationRoot = ${powerShellLiteral(path.join(pluginRoot, "com.wutpeach.clackly"))};` } [System.IO.File]::AppendAllText((Join-Path $mutationRoot 'manifest.xml'), 'tampered') }`
    : "";
  const injector = failurePoints.filter(Boolean).length || mutation
    ? `-FailureInjector { param($point) ${mutation} if (@(${failurePoints.filter(Boolean).map(powerShellLiteral).join(",")}) -contains $point) { throw 'injected failure' } }`
    : "";
  const script = [
    `$ErrorActionPreference = 'Stop'; Import-Module ${powerShellLiteral(modulePath)} -Force;`,
    packageArgument,
    `$result = ${entry} ${uninstall ? "" : "-Package $package "}-PluginRoot ${powerShellLiteral(pluginRoot)} -ProcessState ${powerShellLiteral(processState)} ${injector};`,
    "$result | ConvertTo-Json -Compress"
  ].join(" ");
  const result = runPowerShell(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
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
  fs.copyFileSync(qualifiedNode, path.join(payloadApp, "workflow-plugin", "WorkflowIntegration.node"));
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), JSON.stringify({ schemaVersion: 1, profiles: [{ id: "fixture" }] }), "utf8");
  for (const file of ["安装 Clackly.bat", "卸载 Clackly.bat", "README.txt"]) fs.copyFileSync(path.join(templateRoot, file), path.join(packageRoot, file));
  const tools = path.join(packageRoot, "tools");
  fs.mkdirSync(tools);
  for (const file of ["Install-Clackly.ps1", "Uninstall-Clackly.ps1", "ClacklyInstaller.psm1"]) fs.copyFileSync(path.join(templateRoot, file), path.join(tools, file));
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
  fs.copyFileSync(qualifiedNode, path.join(appRoot, "workflow-plugin", "WorkflowIntegration.node"));
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), JSON.stringify({ schemaVersion: 1, profiles: [{ id: "fixture" }] }), "utf8");
  return { sourceRoot, packageRoot, appRoot };
}

function readInstalledVersion(pluginRoot) {
  return /<Version>([^<]+)<\/Version>/.exec(fs.readFileSync(path.join(pluginRoot, "com.wutpeach.clackly", "manifest.xml"), "utf8"))[1];
}

function transactionPaths(pluginRoot) {
  if (!fs.existsSync(pluginRoot)) return [];
  return fs.readdirSync(pluginRoot)
    .filter((name) => /^\.com\.wutpeach\.clackly\.(?:stage|backup|failed|uninstall)\./i.test(name))
    .map((name) => path.join(pluginRoot, name))
    .sort();
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-builder-"));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-archive-"));
  try {
    const { sourceRoot, packageRoot, appRoot } = createPackagedBuilderFixture(root, "0.1.1");
    assert.throws(() => betaBuilder.assertPackageIdentity({ appRoot: sourceRoot, packageRoot }), /authorities disagree/);
    fs.writeFileSync(path.join(appRoot, "package.json"), JSON.stringify({ name: "clackly", version: "0.1.0" }), "utf8");
    fs.writeFileSync(path.join(appRoot, "manifest.xml"), "<BlackmagicDesign><Plugin><Id>com.wutpeach.clackly</Id><Version>0.1.0</Version></Plugin></BlackmagicDesign>", "utf8");
    fs.appendFileSync(path.join(appRoot, "workflow-plugin", "WorkflowIntegration.node"), "changed", "utf8");
    assert.throws(() => betaBuilder.assertPackageIdentity({ appRoot: sourceRoot, packageRoot }), /qualified Beta identity/);
    fs.copyFileSync(qualifiedNode, path.join(appRoot, "workflow-plugin", "WorkflowIntegration.node"));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-transaction-"));
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
    assert.equal(retainedPathNames(rollbackFailure).every((name) => transactionPathNames(pluginRoot).includes(name)), true);

    const running = invokeModule({ packageRoot: failedUpgrade, pluginRoot: path.join(root, "running"), processState: "running" });
    assert.equal(running.Code, 12, "Resolve-running refusal happens before a target exists");
    assert.equal(fs.existsSync(path.join(root, "running", "com.wutpeach.clackly")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta rejects reparse package and plugin-root ancestors before any transaction mutation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-ancestor-"));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-remnants-"));
  try {
    const base = createFixture(path.join(root, "base"), "0.1.0");
    const next = createFixture(path.join(root, "next"), "0.1.1");
    for (const [name, failurePoint, expectedCode] of [
      ["cleanup", "cleanup", 18],
      ["failed-cleanup", ["after-activation", "before-failed-cleanup"], 17],
      ["restore", ["after-activation", "before-restore"], 17]
    ]) {
      const pluginRoot = path.join(root, name, "plugins");
      assert.equal(invokeModule({ packageRoot: base, pluginRoot }).Code, 0);
      const result = invokeModule({ packageRoot: next, pluginRoot, failurePoint });
      assert.equal(result.Code, expectedCode, `${name} has its distinct truthful result`);
      assert.deepEqual(retainedPathNames(result), transactionPathNames(pluginRoot), `${name} reports every surviving task-owned path`);
      assert.equal(result.RetainedPaths.every((candidate) => fs.existsSync(candidate)), true);
      if (name === "cleanup") assert.equal(readInstalledVersion(pluginRoot), "0.1.1", "cleanup failure retains the verified new active plugin");
      if (name === "failed-cleanup") assert.equal(readInstalledVersion(pluginRoot), "0.1.0", "failed-candidate cleanup failure restores the prior plugin");
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal Beta rejects corrupt inventories and reparse package entries before mutation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-preflight-"));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-beta-uninstall-"));
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clackly beta 中文 & apostrophe-"));
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
