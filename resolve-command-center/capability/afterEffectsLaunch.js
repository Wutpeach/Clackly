const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile: defaultExecFile, spawn } = require("node:child_process");
const { runExecFile } = require("./powerShell");

const PLAN_TYPE = "after-effects-jsx";
const JSX_ARGUMENT = "$CLACKLY_JSX";
const MAX_JSX_BYTES = 768 * 1024;

function launchError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative && !path.isAbsolute(relative)
    && relative !== ".." && !relative.startsWith(`..${path.sep}`);
}

function canonicalFile(fileSystem, candidate, label) {
  if (typeof candidate !== "string" || candidate.trim() !== candidate || !path.isAbsolute(candidate)) {
    throw launchError("AFTER_EFFECTS_LAUNCH_INVALID", `${label} must be one absolute file path`);
  }
  try {
    const canonical = fileSystem.realpathSync(candidate);
    if (!fileSystem.statSync(canonical).isFile()) throw new Error("not a regular file");
    return canonical;
  } catch (_error) {
    throw launchError("AFTER_EFFECTS_LAUNCH_INVALID", `${label} must be an existing regular file`);
  }
}

function samePath(left, right, platform) {
  return platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

class AfterEffectsLauncher {
  constructor({
    execFile = defaultExecFile,
    fileSystem = fs,
    hostEnvironment = process.env,
    isRunning,
    platform = process.platform,
    spawnProcess = spawn,
    temporaryRoot = os.tmpdir()
  } = {}) {
    if (!hostEnvironment || typeof hostEnvironment !== "object"
      || typeof execFile !== "function"
      || typeof spawnProcess !== "function" || typeof temporaryRoot !== "string") {
      throw new TypeError("After Effects Launcher requires host environment, process, and temp inputs");
    }
    this.execFile = execFile;
    this.fileSystem = fileSystem;
    this.hostEnvironment = hostEnvironment;
    this.isRunning = isRunning || ((executable) => this.detectRunning(executable));
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.temporaryRoot = fileSystem.realpathSync(temporaryRoot);
  }

  async detectRunning(executable) {
    if (this.platform !== "win32") return false;
    const systemRoot = Object.entries(this.hostEnvironment)
      .find(([key]) => key.toLowerCase() === "systemroot")?.[1];
    if (typeof systemRoot !== "string" || !systemRoot.trim()) {
      throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
        cause: "missing SystemRoot"
      });
    }
    const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    let output;
    try {
      output = await runExecFile(this.execFile, powershell, [
        "-NoProfile", "-Command",
        "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='SilentlyContinue'; $records = @(Get-Process -Name AfterFX | ForEach-Object { $entry = [PSCustomObject]@{ Path = $null; Error = $null }; try { $entry.Path = $_.Path } catch { $entry.Error = $_.Exception.Message }; if (-not $entry.Path) { $entry.Error = 'path unavailable' }; $entry }); [PSCustomObject]@{ ProcessCount = $records.Count; Records = $records } | ConvertTo-Json -Compress"
      ], { env: this.hostEnvironment });
    } catch (error) {
      throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
        cause: error?.message || String(error),
        ...(typeof error?.code === "string" ? { causeCode: error.code } : {})
      });
    }

    let payload;
    try {
      payload = JSON.parse(output);
    } catch (_error) {
      throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
        cause: "malformed process output"
      });
    }
    if (!payload || typeof payload !== "object"
      || !Number.isInteger(payload.ProcessCount)
      || !Array.isArray(payload.Records)
      || payload.Records.length !== payload.ProcessCount) {
      throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
        cause: "inconsistent process count"
      });
    }

    let matched = false;
    let unresolved = false;
    for (const record of payload.Records) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
          cause: "malformed process record"
        });
      }
      const hasPath = typeof record.Path === "string" && record.Path.length > 0;
      const hasError = typeof record.Error === "string" && record.Error.length > 0;
      if ((hasPath && hasError) || (!hasPath && !hasError)) {
        throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
          cause: "malformed process record"
        });
      }
      if (!hasPath) {
        unresolved = true;
        continue;
      }
      let candidate;
      try {
        candidate = canonicalFile(this.fileSystem, record.Path, "Running After Effects executable");
      } catch (_error) {
        unresolved = true;
        continue;
      }
      if (samePath(candidate, executable, this.platform)) matched = true;
    }

    if (matched) return true;
    if (unresolved) {
      throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects running state could not be determined", {
        cause: "running state unresolved"
      });
    }
    return false;
  }

  validate(plan, configuredExecutable) {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)
      || plan.type !== PLAN_TYPE
      || !Array.isArray(plan.args)
      || plan.args.length !== 2
      || plan.args[0] !== "-r"
      || plan.args[1] !== JSX_ARGUMENT
      || typeof plan.jsx !== "string"
      || plan.jsx.length === 0
      || Buffer.byteLength(plan.jsx, "utf8") > MAX_JSX_BYTES
      || plan.jsx.includes("\0")) {
      throw launchError("AFTER_EFFECTS_LAUNCH_INVALID", "After Effects launch plan is invalid");
    }
    const configured = canonicalFile(this.fileSystem, configuredExecutable, "Configured After Effects executable");
    const executable = canonicalFile(this.fileSystem, plan.executable, "Launch-plan After Effects executable");
    if (!samePath(configured, executable, this.platform)) {
      throw launchError("AFTER_EFFECTS_LAUNCH_INVALID", "Launch-plan executable differs from ae.export.aePath");
    }
    return { executable, jsx: plan.jsx };
  }

  bootstrapPath(executable) {
    if (this.platform === "win32") {
      return path.join(path.dirname(executable), "Scripts", "Startup", "_resolve2ae_bootstrap.jsx");
    }
    if (this.platform === "darwin") {
      return path.join(path.dirname(path.dirname(executable)), "Scripts", "Startup", "_resolve2ae_bootstrap.jsx");
    }
    throw launchError("AFTER_EFFECTS_LAUNCH_INVALID", "After Effects desktop launch is unsupported on this platform");
  }

  spawnOnce(executable, args) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = this.spawnProcess(executable, args, {
          cwd: path.dirname(executable),
          env: this.hostEnvironment,
          shell: false,
          stdio: "ignore",
          windowsHide: false
        });
      } catch (error) {
        reject(launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects could not be started", {
          cause: error?.message || String(error)
        }));
        return;
      }
      let settled = false;
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        reject(launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects could not be started", {
          cause: error?.message || String(error),
          ...(typeof error?.code === "string" ? { causeCode: error.code } : {})
        }));
      });
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        if (typeof child.unref === "function") child.unref();
        resolve();
      });
    });
  }

  async execute(plan, { configuredExecutable } = {}) {
    const { executable, jsx } = this.validate(plan, configuredExecutable);
    const jsxPath = path.join(this.temporaryRoot, `clackly-ae-${crypto.randomUUID()}.jsx`);
    if (!contained(this.temporaryRoot, jsxPath)) {
      throw launchError("AFTER_EFFECTS_LAUNCH_INVALID", "After Effects JSX path escapes the host temp root");
    }
    let bootstrapPath = null;
    let bootstrapCreated = false;
    try {
      this.fileSystem.writeFileSync(jsxPath, jsx, { encoding: "utf8", flag: "wx" });
      const running = await Promise.resolve(this.isRunning(executable));
      if (running) {
        await this.spawnOnce(executable, ["-r", jsxPath]);
        return { mode: "running" };
      }

      bootstrapPath = this.bootstrapPath(executable);
      this.fileSystem.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
      const jsxReference = `var f = new File(${JSON.stringify(jsxPath.replaceAll("\\", "/"))}); if(f.exists) $.evalFile(f);`;
      const bootstrap = [
        "(function(){",
        `  app.scheduleTask(${JSON.stringify(jsxReference)}, 3000, false);`,
        "  var me = new File($.fileName); if(me.exists) me.remove();",
        "})();"
      ].join("\n");
      this.fileSystem.writeFileSync(bootstrapPath, bootstrap, { encoding: "utf8", flag: "wx" });
      bootstrapCreated = true;
      await this.spawnOnce(executable, []);
      return { mode: "cold" };
    } catch (error) {
      try { this.fileSystem.rmSync(jsxPath, { force: true }); } catch (_cleanupError) {}
      if (bootstrapCreated) {
        try { this.fileSystem.rmSync(bootstrapPath, { force: true }); } catch (_cleanupError) {}
      }
      if (["AFTER_EFFECTS_LAUNCH_INVALID", "AFTER_EFFECTS_LAUNCH_FAILED"].includes(error?.code)) {
        throw error;
      }
      throw launchError("AFTER_EFFECTS_LAUNCH_FAILED", "After Effects launch preparation failed", {
        cause: error?.message || String(error),
        ...(typeof error?.code === "string" ? { causeCode: error.code } : {})
      });
    }
  }
}

module.exports = { AfterEffectsLauncher, JSX_ARGUMENT, PLAN_TYPE };
