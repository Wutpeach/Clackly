const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { runExecFile } = require("./powerShell");

const CAPABILITY_ID = "ae.export";

function cleanPath(value) {
  return String(value || "").trim().replace(/^"(.*)"$/, "$1");
}

function isFile(filePath, fileSystem) {
  if (!filePath) return false;
  try {
    return fileSystem.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
}

async function findRunningPath({ execFile, fileSystem }) {
  try {
    const output = await runExecFile(execFile, "powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='SilentlyContinue'; Get-Process -Name AfterFX | ForEach-Object { $_.Path }"
    ]);
    return output.split(/\r?\n/).map(cleanPath).find((candidate) => (
      isFile(candidate, fileSystem)
    )) || null;
  } catch (_error) {
    // A missing process, timeout, or malformed candidate is an expected miss.
    return null;
  }
}

function findEnvironmentValue(environment, name) {
  const key = Object.keys(environment).find((candidate) => (
    candidate.toLowerCase() === name.toLowerCase()
  ));
  return key ? environment[key] : undefined;
}

async function findAppPath({ environment, execFile, fileSystem }) {
  const key = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\AfterFX.exe";
  for (const hive of ["HKEY_CURRENT_USER", "HKEY_LOCAL_MACHINE"]) {
    try {
      const registryPath = `Registry::${hive}\\${key}`;
      const output = await runExecFile(execFile, "powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); (Get-Item -LiteralPath '${registryPath}' -ErrorAction Stop).GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)`
      ]);
      const candidate = cleanPath(output).replace(/%([^%]+)%/g, (token, name) => (
        findEnvironmentValue(environment, name) || token
      ));
      if (isFile(candidate, fileSystem)) return candidate;
    } catch (_error) {
      // A missing hive/key is normal; continue to the next discovery strategy.
    }
  }
  return null;
}

function compareStandardCandidates(left, right) {
  const length = Math.max(left.version.length, right.version.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right.version[index] || 0) - (left.version[index] || 0);
    if (difference) return difference;
  }
  const leftPath = left.filePath.toLowerCase();
  const rightPath = right.filePath.toLowerCase();
  return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
}

function findStandardPath({ environment, fileSystem }) {
  const roots = ["ProgramW6432", "ProgramFiles", "ProgramFiles(x86)"]
    .map((name) => findEnvironmentValue(environment, name))
    .filter(Boolean)
    .filter((root, index, values) => (
      values.findIndex((value) => value.toLowerCase() === root.toLowerCase()) === index
    ));
  const candidates = [];

  for (const root of roots) {
    try {
      for (const entry of fileSystem.readdirSync(path.join(root, "Adobe"), {
        withFileTypes: true
      })) {
        const match = entry.isDirectory()
          && entry.name.match(/^Adobe After Effects\s+.*?(\d+(?:\.\d+)*)/i);
        if (!match) continue;
        const filePath = path.join(root, "Adobe", entry.name, "Support Files", "AfterFX.exe");
        if (isFile(filePath, fileSystem)) {
          candidates.push({ filePath, version: match[1].split(".").map(Number) });
        }
      }
    } catch (_error) {
      // An absent or unreadable standard directory is an expected miss.
    }
  }

  candidates.sort(compareStandardCandidates);
  return candidates[0] ? candidates[0].filePath : null;
}

async function discoverAfterEffectsPath(options) {
  const running = await findRunningPath(options);
  if (running) return running;
  const registered = await findAppPath(options);
  if (registered) return registered;
  return findStandardPath(options);
}

async function initializeAfterEffectsPath(configManager, {
  environment = process.env,
  execFile = childProcess.execFile,
  fileSystem = fs,
  platform = process.platform
} = {}) {
  const values = configManager.get(CAPABILITY_ID);
  if (isFile(values.aePath, fileSystem)) return values.aePath;
  if (platform !== "win32") return null;

  const hadAePath = Object.hasOwn(values, "aePath");
  const startingAePath = hadAePath ? values.aePath : null;

  const aePath = await discoverAfterEffectsPath({ environment, execFile, fileSystem });
  const current = configManager.get(CAPABILITY_ID);

  if (aePath) {
    if (hadAePath) {
      if (Object.hasOwn(current, "aePath") && current.aePath === startingAePath) {
        configManager.update(CAPABILITY_ID, { aePath });
        return aePath;
      }
      return isFile(current.aePath, fileSystem) ? current.aePath : null;
    }
    if (!Object.hasOwn(current, "aePath")) {
      configManager.update(CAPABILITY_ID, { aePath });
      return aePath;
    }
    return isFile(current.aePath, fileSystem) ? current.aePath : null;
  }

  if (hadAePath && Object.hasOwn(current, "aePath") && current.aePath === startingAePath) {
    const remaining = { ...current };
    delete remaining.aePath;
    configManager.save(CAPABILITY_ID, remaining);
  }
  return null;
}

module.exports = { initializeAfterEffectsPath };
