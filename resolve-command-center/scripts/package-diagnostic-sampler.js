const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOT = path.join(__dirname, "diagnostic-sampler");
const FILES = ["Start-Clackly-Diagnostics.cmd", "Collect-ClacklyDiagnostics.ps1", "README.txt"];

function runPowerShell(script) {
  const command = "$ErrorActionPreference = 'Stop'; " + script;
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { encoding: "utf8", windowsHide: true });
  if (result.error) throw new Error("PowerShell archive operation could not start: " + result.error.message);
  if (result.status !== 0) throw new Error("PowerShell archive operation failed (exit " + result.status + ", signal " + result.signal + "): " + (result.stderr || result.stdout));
}

function ps(value) { return `'${String(value).replaceAll("'", "''")}'`; }

function buildDiagnosticSampler({ sourceRoot = SOURCE_ROOT, outputRoot = path.join(APP_ROOT, "release", "diagnostic-sampler") } = {}) {
  for (const name of FILES) {
    const stats = fs.lstatSync(path.join(sourceRoot, name));
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Sampler source is not a normal file: ${name}`);
  }
  const name = "Clackly-Diagnostic-Sampler";
  const output = path.join(outputRoot, name);
  const zipPath = path.join(outputRoot, `${name}.zip`);
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.rmSync(output, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.mkdirSync(output);
  for (const file of FILES) fs.copyFileSync(path.join(sourceRoot, file), path.join(output, file));
  runPowerShell(`Compress-Archive -LiteralPath ${ps(output)} -DestinationPath ${ps(zipPath)} -Force`);
  const verify = fs.mkdtempSync(path.join(os.tmpdir(), "clackly-diagnostic-zip-"));
  try {
    runPowerShell(`Expand-Archive -LiteralPath ${ps(zipPath)} -DestinationPath ${ps(verify)} -Force`);
    for (const file of FILES) {
      const extracted = path.join(verify, name, file);
      if (!fs.readFileSync(extracted).equals(fs.readFileSync(path.join(sourceRoot, file)))) {
        throw new Error("ZIP content differs from source: " + file);
      }
      if (!fs.statSync(path.join(verify, name, file)).isFile()) throw new Error(`ZIP is missing ${file}`);
    }
    if (JSON.stringify(fs.readdirSync(path.join(verify, name)).sort()) !== JSON.stringify([...FILES].sort()) || fs.readdirSync(verify).join() !== name) {
      throw new Error("ZIP contains unexpected entries");
    }
  } finally { fs.rmSync(verify, { recursive: true, force: true }); }
  return { output, zipPath, files: [...FILES] };
}

if (require.main === module) {
  try { console.log(`Created diagnostic sampler: ${buildDiagnosticSampler().zipPath}`); }
  catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
}

module.exports = { FILES, SOURCE_ROOT, buildDiagnosticSampler };
