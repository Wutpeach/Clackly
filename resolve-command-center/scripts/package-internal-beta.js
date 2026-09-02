const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const PLUGIN_ID = "com.wutpeach.clackly";
const NATIVE_SIZE = 379_904;
const NATIVE_SHA256 = "C442DFD013DA2244F53BA8B36B9439CCCC197DF90B999D0074031C6D921B7B05";

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function assertContained(root, candidate, { allowRoot = false } = {}) {
  const canonicalRoot = path.resolve(root);
  const canonicalCandidate = path.resolve(candidate);
  if ((allowRoot && canonicalCandidate === canonicalRoot) || canonicalCandidate.startsWith(`${canonicalRoot}${path.sep}`)) return canonicalCandidate;
  throw new Error(`Path escapes its owned root: ${candidate}`);
}

function assertSafeRelativePath(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)
    || relativePath.includes("\\") || relativePath.includes(":") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe distribution path: ${relativePath}`);
  }
  return relativePath;
}

function getExistingLstatOrNull(pathValue) {
  try {
    return fs.lstatSync(pathValue);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function assertNormalExistingDirectory(pathValue) {
  const canonicalPath = path.resolve(pathValue);
  let current = canonicalPath;
  while (true) {
    const stats = getExistingLstatOrNull(current);
    if (stats) {
      if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(`Distribution directory root is unsafe: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) return canonicalPath;
    current = parent;
  }
}

function removeOwnedOutput(outputRoot, candidate, { directory }) {
  assertContained(outputRoot, candidate);
  const stats = getExistingLstatOrNull(candidate);
  if (!stats) return;
  if (stats.isSymbolicLink() || (directory ? !stats.isDirectory() : !stats.isFile())) {
    throw new Error(`Owned Beta output is unsafe: ${candidate}`);
  }
  if (directory) listTree(candidate);
  fs.rmSync(candidate, { recursive: directory, force: true });
}

function listTree(root, { exclude = new Set() } = {}) {
  const result = [];
  const seen = new Set();
  function visit(directory, relativeBase = "") {
    const directoryStats = fs.lstatSync(directory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) throw new Error(`Distribution directory is unsafe: ${directory}`);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = path.join(directory, entry.name);
      const relative = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      assertSafeRelativePath(relative);
      const stats = fs.lstatSync(candidate);
      if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) throw new Error(`Distribution entry is unsafe: ${relative}`);
      if (stats.isDirectory()) {
        visit(candidate, relative);
      } else if (!exclude.has(relative)) {
        const key = relative.toUpperCase();
        if (seen.has(key)) throw new Error(`Case-colliding distribution entry: ${relative}`);
        seen.add(key);
        result.push({ relativePath: relative, sha256: sha256(candidate), size: stats.size });
      }
    }
  }
  visit(root);
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function assertSafePackageSource(packageRoot) {
  assertNormalExistingDirectory(packageRoot);
  return listTree(packageRoot);
}

function writeHashManifest(root) {
  const entries = listTree(root, { exclude: new Set(["SHA256SUMS.txt"]) });
  const text = `${entries.map((entry) => `${entry.sha256}  ${entry.relativePath}`).join("\n")}\n`;
  fs.writeFileSync(path.join(root, "SHA256SUMS.txt"), text, "utf8");
  return entries;
}

function verifyHashManifest(root) {
  const manifestPath = path.join(root, "SHA256SUMS.txt");
  const expected = new Map();
  const lines = fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error("SHA256SUMS.txt is empty");
  for (const line of lines) {
    const match = /^([A-Fa-f0-9]{64})  (.+)$/.exec(line);
    if (!match) throw new Error("Malformed SHA256SUMS entry");
    const relativePath = assertSafeRelativePath(match[2]);
    const key = relativePath.toUpperCase();
    if (expected.has(key)) throw new Error(`Duplicate or case-colliding SHA256SUMS entry: ${relativePath}`);
    expected.set(key, { relativePath, sha256: match[1].toUpperCase() });
  }
  const actual = listTree(root, { exclude: new Set(["SHA256SUMS.txt"]) });
  if (actual.length !== expected.size) throw new Error("SHA256SUMS inventory differs from the distribution tree");
  for (const entry of actual) {
    const expectedEntry = expected.get(entry.relativePath.toUpperCase());
    if (!expectedEntry || expectedEntry.relativePath !== entry.relativePath || expectedEntry.sha256 !== entry.sha256) {
      throw new Error(`SHA256SUMS verification failed: ${entry.relativePath}`);
    }
  }
  return actual;
}

function readWorkflowManifest(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (/<!DOCTYPE/i.test(text)) throw new Error("Workflow manifest must not contain a DOCTYPE");
  const id = /<Id>\s*([^<]+?)\s*<\/Id>/i.exec(text)?.[1];
  const version = /<Version>\s*([^<]+?)\s*<\/Version>/i.exec(text)?.[1];
  if (id !== PLUGIN_ID || !/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("Workflow manifest identity is invalid");
  return { id, version };
}

function assertPackageIdentity({ appRoot = APP_ROOT, packageRoot }) {
  const repositoryPackage = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
  const repositoryManifest = readWorkflowManifest(path.join(appRoot, "manifest.xml"));
  const packagedApp = path.join(packageRoot, "resources", "app");
  const packagedPackage = JSON.parse(fs.readFileSync(path.join(packagedApp, "package.json"), "utf8"));
  const packagedManifest = readWorkflowManifest(path.join(packagedApp, "manifest.xml"));
  if (repositoryPackage.version !== repositoryManifest.version || repositoryPackage.version !== packagedPackage.version
    || repositoryPackage.version !== packagedManifest.version || packagedManifest.id !== PLUGIN_ID) {
    throw new Error("package.json and Workflow manifest version/id authorities disagree");
  }
  const workflowNode = path.join(packagedApp, "workflow-plugin", "WorkflowIntegration.node");
  const stats = fs.statSync(workflowNode);
  if (!stats.isFile() || stats.size !== NATIVE_SIZE || sha256(workflowNode) !== NATIVE_SHA256) {
    throw new Error("WorkflowIntegration.node does not match the qualified Beta identity");
  }
  for (const required of [
    path.join(packagedApp, "workflow-plugin", "main.js"),
    path.join(packageRoot, "resources", "runtimes", "manifest.json")
  ]) {
    if (!fs.statSync(required).isFile()) throw new Error(`Missing required packaged file: ${required}`);
  }
  return { version: repositoryPackage.version, workflowNode };
}

function copyRequiredTemplate(sourceRoot, outputRoot, templateName, destinationName = templateName) {
  const source = path.join(sourceRoot, templateName);
  const destination = path.join(outputRoot, destinationName);
  fs.copyFileSync(source, destination);
}

function createDistribution({ appRoot = APP_ROOT, packageRoot = path.join(APP_ROOT, "release", "win-unpacked"), outputRoot = path.join(APP_ROOT, "release", "internal-beta"), templateRoot = path.join(APP_ROOT, "scripts", "internal-beta") } = {}) {
  // Validate the complete source tree before any owned-output replacement.
  // In particular, lstat rejects a nested junction before removeOwnedOutput can run.
  assertSafePackageSource(packageRoot);
  const identity = assertPackageIdentity({ appRoot, packageRoot });
  assertNormalExistingDirectory(outputRoot);
  const name = `Clackly-Beta-${identity.version}-win-x64`;
  const output = assertContained(outputRoot, path.join(outputRoot, name));
  const zipPath = assertContained(outputRoot, path.join(outputRoot, `${name}.zip`));
  fs.mkdirSync(outputRoot, { recursive: true });
  removeOwnedOutput(outputRoot, output, { directory: true });
  removeOwnedOutput(outputRoot, zipPath, { directory: false });
  fs.mkdirSync(output, { recursive: true });
  for (const file of ["安装 Clackly.bat", "卸载 Clackly.bat", "README.txt"]) copyRequiredTemplate(templateRoot, output, file);
  const tools = path.join(output, "tools");
  fs.mkdirSync(tools);
  for (const file of ["Install-Clackly.ps1", "Uninstall-Clackly.ps1", "ClacklyInstaller.psm1"]) copyRequiredTemplate(templateRoot, tools, file);
  fs.cpSync(packageRoot, path.join(output, "payload", "win-unpacked"), { recursive: true, dereference: false, errorOnExist: true });
  writeHashManifest(output);
  verifyHashManifest(output);
  return { ...identity, name, output, zipPath, inventory: listTree(output, { exclude: new Set(["SHA256SUMS.txt"]) }) };
}

function quotePowerShellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function runPowerShell(script) {
  const boundedScript = "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; " + script;
  const encoded = Buffer.from(boundedScript, "utf16le").toString("base64");
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`PowerShell archive operation failed: ${result.stderr || result.stdout}`);
}

function createAndVerifyZip(distribution) {
  runPowerShell(`Compress-Archive -LiteralPath ${quotePowerShellLiteral(distribution.output)} -DestinationPath ${quotePowerShellLiteral(distribution.zipPath)} -Force`);
  const verificationRoot = path.join(path.dirname(distribution.output), `.verify-${crypto.randomUUID()}`);
  try {
    fs.mkdirSync(verificationRoot, { recursive: true });
    runPowerShell(`Expand-Archive -LiteralPath ${quotePowerShellLiteral(distribution.zipPath)} -DestinationPath ${quotePowerShellLiteral(verificationRoot)} -Force`);
    const extracted = path.join(verificationRoot, distribution.name);
    verifyHashManifest(extracted);
    const expected = distribution.inventory.map((entry) => `${entry.relativePath}:${entry.sha256}`);
    const actual = listTree(extracted, { exclude: new Set(["SHA256SUMS.txt"]) }).map((entry) => `${entry.relativePath}:${entry.sha256}`);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("ZIP extraction inventory differs from the pre-ZIP distribution");
  } finally {
    if (fs.existsSync(verificationRoot)) fs.rmSync(verificationRoot, { recursive: true, force: true });
  }
  return { zipPath: distribution.zipPath, sha256: sha256(distribution.zipPath), size: fs.statSync(distribution.zipPath).size };
}

function runExistingPackage({ runner = childProcess.spawnSync } = {}) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const command of ["package:win", "package:verify"]) {
    // Node cannot execFile a .cmd directly on Windows. The executable and arguments
    // are fixed here, so a Windows command shell does not introduce package-path input.
    const result = runner(npm, ["run", command], {
      cwd: APP_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${npm} run ${command} failed with exit code ${result.status}`);
  }
}

function packageInternalBeta() {
  runExistingPackage();
  const distribution = createDistribution();
  const zip = createAndVerifyZip(distribution);
  console.log(`Created verified internal Beta: ${zip.zipPath}`);
  console.log(`SHA-256: ${zip.sha256}`);
  console.log(`Size: ${zip.size} bytes`);
  return { ...distribution, zip };
}

if (require.main === module) {
  try {
    packageInternalBeta();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  APP_ROOT, PLUGIN_ID, NATIVE_SIZE, NATIVE_SHA256, sha256, assertContained, assertSafeRelativePath,
  getExistingLstatOrNull, assertNormalExistingDirectory, removeOwnedOutput, listTree, assertSafePackageSource, writeHashManifest, verifyHashManifest, readWorkflowManifest, assertPackageIdentity,
  createDistribution, createAndVerifyZip, runExistingPackage, packageInternalBeta
};
