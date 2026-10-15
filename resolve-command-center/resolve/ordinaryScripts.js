const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const MAX_RECEIPT_BYTES = 64 * 1024;

function isRegularFile(fileSystem, candidate) {
  try {
    return fileSystem.statSync(candidate).isFile();
  } catch (_error) {
    return false;
  }
}

function isDirectory(fileSystem, candidate) {
  try {
    return fileSystem.statSync(candidate).isDirectory();
  } catch (_error) {
    return false;
  }
}

function resolveQualifiedRuntime({
  environment = process.env,
  fileSystem = fs,
  platform = process.platform,
  helperPath = path.join(__dirname, "ordinary_scripts.py")
} = {}) {
  if (platform !== "win32") return null;

  const programFiles = environment.ProgramFiles || environment.PROGRAMFILES || "C:\\Program Files";
  const programData = environment.PROGRAMDATA || "C:\\ProgramData";
  const resolveRoot = path.win32.join(programFiles, "Blackmagic Design", "DaVinci Resolve");
  const scriptingRoot = path.win32.join(
    programData, "Blackmagic Design", "DaVinci Resolve", "Support", "Developer", "Scripting"
  );
  const runtime = {
    executable: path.win32.join(resolveRoot, "ResolvePython", "ResolvePython.exe"),
    libraryPath: path.win32.join(resolveRoot, "fusionscript.dll"),
    moduleDirectory: path.win32.join(scriptingRoot, "Modules"),
    scriptingRoot,
    helperPath
  };

  return isRegularFile(fileSystem, runtime.executable)
    && isRegularFile(fileSystem, runtime.libraryPath)
    && isDirectory(fileSystem, runtime.moduleDirectory)
    && isRegularFile(fileSystem, runtime.helperPath)
    ? runtime
    : null;
}

function createResolvePythonTransport({
  spawnProcess = spawn,
  timeoutMs = 10_000,
  maxReceiptBytes = MAX_RECEIPT_BYTES,
  environment = process.env
} = {}) {
  return {
    run(request, runtime) {
      const body = JSON.stringify(request);
      return new Promise((resolve, reject) => {
        let child;
        let timer;
        let settled = false;
        let stdout = "";
        let stderr = "";

        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };
        const stop = (reason) => {
          if (settled) return;
          try {
            child?.kill(); // This is only the short-lived Clackly helper, never Resolve or a script process.
          } catch (_error) {}
          finish(reason instanceof Error ? reason : new Error(reason));
        };

        try {
          child = spawnProcess(runtime.executable, ["-B", runtime.helperPath], {
            shell: false,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
            env: {
              ...environment,
              RESOLVE_SCRIPT_API: runtime.scriptingRoot,
              RESOLVE_SCRIPT_LIB: runtime.libraryPath,
              CLACKLY_RESOLVE_SCRIPT_MODULES: runtime.moduleDirectory,
              PYTHONPATH: runtime.moduleDirectory
            }
          });
        } catch (error) {
          finish(error);
          return;
        }

        child.once("error", stop);
        child.stdin.once("error", stop);
        child.stdout.once("error", stop);
        child.stderr.once("error", stop);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
          if (Buffer.byteLength(stdout) > maxReceiptBytes) stop("Resolve script helper receipt exceeded its limit");
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
          if (Buffer.byteLength(stderr) > maxReceiptBytes) stop("Resolve script helper diagnostics exceeded its limit");
        });
        child.once("close", (code) => {
          if (settled) return;
          if (code !== 0) {
            finish(new Error(`Resolve script helper exited with ${code}: ${stderr.slice(0, 512)}`));
            return;
          }
          try {
            finish(null, JSON.parse(stdout));
          } catch (error) {
            finish(new Error(`Resolve script helper returned malformed JSON: ${error.message}`));
          }
        });
        timer = setTimeout(() => stop("Resolve script helper timed out"), timeoutMs);
        try {
          child.stdin.end(body);
        } catch (error) {
          stop(error);
        }
      });
    }
  };
}

function validScript(record) {
  return record && typeof record === "object"
    && typeof record.id === "string" && record.id.length > 0
    && typeof record.name === "string"
    && typeof record.absolutePath === "string"
    && ["python", "lua"].includes(record.language)
    && ["system", "user"].includes(record.source)
    && (typeof record.category === "string" || record.category === null)
    && Array.isArray(record.nesting) && record.nesting.every((item) => typeof item === "string");
}

function unavailableSnapshot() {
  return {
    scripts: [],
    diagnostics: [{ code: "runtime_unavailable", message: "The qualified Windows ResolvePython layout is unavailable" }]
  };
}

function submissionUnknown(requestId, reason) {
  return { requestId, status: "submission_unknown", reason };
}

function copyRecord(record) {
  return { ...record, nesting: [...record.nesting] };
}

function createOrdinaryScripts(options = {}) {
  const fixedRuntime = Object.hasOwn(options, "runtime")
    ? options.runtime
    : options.installationPathsProvider ? null : resolveQualifiedRuntime(options);
  const transport = options.transport || createResolvePythonTransport(options);
  const createRequestId = options.createRequestId || crypto.randomUUID;
  let records = new Map();
  let runtimeIdentity = null;
  async function currentRuntime() {
    if (!options.installationPathsProvider) return fixedRuntime;
    const snapshot = await options.installationPathsProvider.getSnapshot();
    const identity = JSON.stringify([snapshot.resolveExecutable, snapshot.files]);
    if (runtimeIdentity !== identity) records = new Map();
    runtimeIdentity = identity;
    const helperPath = options.helperPath || path.join(__dirname, "ordinary_scripts.py");
    if (!snapshot.resolvePythonExecutable || !isRegularFile(options.fileSystem || fs, helperPath)) return null;
    return { executable: snapshot.resolvePythonExecutable, libraryPath: snapshot.libraryPath,
      moduleDirectory: path.dirname(snapshot.modulePath), scriptingRoot: snapshot.scriptingRoot, helperPath };
  }

  async function discover() {
    let runtime;
    try { runtime = options.installationPathsProvider ? await currentRuntime() : fixedRuntime; } catch (error) {
      records = new Map();
      return { scripts: [], diagnostics: [{ code: error.code || "runtime_unavailable", message: error.message }] };
    }
    if (!runtime) {
      records = new Map();
      if (options.installationPathsProvider) {
        return { scripts: [], diagnostics: [{ code: "RESOLVE_PYTHON_NOT_FOUND", message: "Current Resolve has no qualified ResolvePython executable" }] };
      }
      return unavailableSnapshot();
    }

    const requestId = createRequestId();
    const discoveredIdentity = runtimeIdentity;
    let receipt;
    try {
      receipt = await transport.run({ operation: "discover", requestId }, runtime);
    } catch (error) {
      records = new Map();
      return {
        scripts: [],
        diagnostics: [{ code: "transport_unavailable", message: String(error?.message || error) }]
      };
    }
    if (options.installationPathsProvider && discoveredIdentity !== runtimeIdentity) {
      return { scripts: [], diagnostics: [{ code: "RESOLVE_INSTALLATION_CHANGED", message: "Resolve installation changed during script discovery" }] };
    }
    if (!receipt || receipt.operation !== "discover" || receipt.requestId !== requestId || receipt.status !== "discovered"
      || !Array.isArray(receipt.scripts) || !Array.isArray(receipt.diagnostics)) {
      records = new Map();
      return {
        scripts: [],
        diagnostics: [{ code: "transport_protocol_invalid", message: "Resolve script helper returned an invalid discovery receipt" }]
      };
    }

    const nextRecords = new Map();
    for (const script of receipt.scripts) {
      if (!validScript(script) || nextRecords.has(script.id)) continue;
      nextRecords.set(script.id, {
        id: script.id,
        name: script.name,
        absolutePath: script.absolutePath,
        language: script.language,
        source: script.source,
        category: script.category,
        nesting: [...script.nesting]
      });
    }
    records = nextRecords;
    return { scripts: [...records.values()].map(copyRecord), diagnostics: receipt.diagnostics };
  }

  async function invoke(scriptId) {
    const requestId = createRequestId();
    let runtime;
    try { runtime = options.installationPathsProvider ? await currentRuntime() : fixedRuntime; } catch (error) {
      records = new Map();
      return { requestId, status: "not_submitted", reason: error.code || "runtime_unavailable" };
    }
    if (typeof scriptId !== "string" || !records.has(scriptId)) {
      return { requestId, status: "not_submitted", reason: "selection_unknown" };
    }
    if (!runtime) return { requestId, status: "not_submitted", reason: options.installationPathsProvider ? "RESOLVE_PYTHON_NOT_FOUND" : "runtime_unavailable" };

    const script = records.get(scriptId);
    let receipt;
    try {
      receipt = await transport.run({
        operation: "invoke",
        requestId,
        scriptId: script.id,
        absolutePath: script.absolutePath
      }, runtime);
    } catch (_error) {
      return submissionUnknown(requestId, "transport_lost");
    }
    if (!receipt || receipt.operation !== "invoke" || receipt.requestId !== requestId
      || !["not_submitted", "api_returned", "submission_unknown"].includes(receipt.status)) {
      return submissionUnknown(requestId, "receipt_invalid");
    }
    return receipt;
  }

  return { discover, invoke };
}

module.exports = { createOrdinaryScripts, createResolvePythonTransport, resolveQualifiedRuntime };
