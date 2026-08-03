const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createRuntimeEnvironment } = require("./environment");
const { RuntimeError } = require("./errors");

const DEFAULT_LIMIT = 1024 * 1024;
const DIAGNOSTIC_LIMIT = 2048;

function isPlainObject(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch (_error) {
    return false;
  }
}

function serializeRequest(request) {
  const seen = new Set();
  const visit = (value) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (Array.isArray(value)) {
      if (seen.has(value)) throw new TypeError("circular value");
      seen.add(value);
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError("sparse array");
        visit(value[index]);
      }
      seen.delete(value);
      return;
    }
    if (!isPlainObject(value) || seen.has(value)) throw new TypeError("non-JSON value");
    seen.add(value);
    for (const item of Object.values(value)) visit(item);
    seen.delete(value);
  };

  if (!isPlainObject(request)) throw new TypeError("request must be an object");
  visit(request);
  const serialized = JSON.stringify(request);
  if (!isPlainObject(JSON.parse(serialized))) throw new TypeError("request must serialize as an object");
  return serialized;
}

function diagnostic(error) {
  let message = "Unknown error";
  try {
    message = typeof error?.message === "string" ? error.message : String(error);
  } catch (_error) {}
  const value = { message: message.slice(0, DIAGNOSTIC_LIMIT) };
  try {
    if (typeof error?.code === "string") value.code = error.code.slice(0, 128);
  } catch (_error) {}
  return value;
}

function executionError(code, message, details = {}) {
  return new RuntimeError(code, message, { details });
}

function nativeCrashFor(exitCode, platform) {
  if (platform !== "win32" || !Number.isInteger(exitCode)) return null;
  const unsigned = exitCode >>> 0;
  return unsigned >= 0xC0000000
    ? { exitCodeHex: `0x${unsigned.toString(16).toUpperCase().padStart(8, "0")}` }
    : null;
}

class RuntimeLauncher {
  constructor({
    bootstrapPath = path.resolve(__dirname, "bootstrap.py"),
    timeoutMs = 10_000,
    maxStdoutBytes = DEFAULT_LIMIT,
    maxStderrBytes = DEFAULT_LIMIT,
    parentEnvironment = process.env,
    platform = process.platform,
    temporaryRoot = os.tmpdir(),
    fileSystem = fs,
    spawnProcess = spawn
  } = {}) {
    for (const [field, value] of Object.entries({ timeoutMs, maxStdoutBytes, maxStderrBytes })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw executionError(
          "RUNTIME_LAUNCH_REQUEST_INVALID",
          `Runtime Launcher requires a positive integer ${field}`,
          { field }
        );
      }
    }
    if (typeof bootstrapPath !== "string" || !path.isAbsolute(bootstrapPath)
      || typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)
      || typeof spawnProcess !== "function") {
      throw executionError(
        "RUNTIME_LAUNCH_REQUEST_INVALID",
        "Runtime Launcher paths and process factory are invalid",
        { field: "constructor" }
      );
    }

    this.bootstrapPath = bootstrapPath;
    this.timeoutMs = timeoutMs;
    this.maxStdoutBytes = maxStdoutBytes;
    this.maxStderrBytes = maxStderrBytes;
    this.parentEnvironment = parentEnvironment;
    this.platform = platform;
    this.temporaryRoot = temporaryRoot;
    this.fileSystem = fileSystem;
    this.spawnProcess = spawnProcess;
  }

  validateFile(candidate, code, label) {
    if (typeof candidate !== "string" || candidate.trim().length === 0
      || candidate !== candidate.trim() || !path.isAbsolute(candidate)) {
      throw executionError(code, `${label} must be one absolute file path`, {
        field: label.toLowerCase(),
        ...(typeof candidate === "string" ? { value: candidate.slice(0, DIAGNOSTIC_LIMIT) } : {})
      });
    }
    try {
      const resolved = this.fileSystem.realpathSync(candidate);
      if (!path.isAbsolute(resolved) || !this.fileSystem.statSync(resolved).isFile()) {
        throw new Error("not a regular file");
      }
      return resolved;
    } catch (_error) {
      throw executionError(code, `${label} must be an existing regular file`, {
        field: label.toLowerCase(),
        value: candidate.slice(0, DIAGNOSTIC_LIMIT)
      });
    }
  }

  execute(input = {}) {
    if (!isPlainObject(input)) {
      return Promise.reject(executionError(
        "RUNTIME_LAUNCH_REQUEST_INVALID",
        "Runtime Launcher requires a Resolver-shaped resolution",
        { field: "resolution" }
      ));
    }

    let resolution;
    let request;
    let serializedRequest;
    let bootstrapPath;
    try {
      ({ resolution, request } = input);
      if (!isPlainObject(resolution) || !["manifest", "override"].includes(resolution.source)) {
        throw executionError(
          "RUNTIME_LAUNCH_REQUEST_INVALID",
          "Runtime Launcher requires a Resolver-shaped resolution",
          { field: "resolution" }
        );
      }
      serializedRequest = serializeRequest(request);
      bootstrapPath = this.validateFile(
        this.bootstrapPath,
        "RUNTIME_LAUNCH_REQUEST_INVALID",
        "Bootstrap path"
      );
      this.validateFile(
        resolution.executable,
        "RUNTIME_EXECUTABLE_INVALID",
        "Runtime executable"
      );
    } catch (error) {
      return Promise.reject(error instanceof RuntimeError ? error : executionError(
        "RUNTIME_LAUNCH_REQUEST_INVALID",
        "Runtime Launcher request must be JSON serializable",
        { field: "request", error: diagnostic(error) }
      ));
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let temporaryDirectory = null;
      let child;
      let timer;
      let settled = false;
      let killed = false;
      let termination = null;
      let terminationError = null;
      let spawnError = null;
      let stdinError = null;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdoutChunks = [];
      const stderrChunks = [];
      let stdoutRetained = 0;
      let stderrRetained = 0;

      const processResult = (exitCode = null, signal = null, fallback = "spawn-error") => ({
        exitCode: Number.isSafeInteger(exitCode) ? exitCode : null,
        signal: typeof signal === "string" ? signal.slice(0, 128) : null,
        termination: termination || (signal ? "signal" : (stdinError ? "stdin-error" : fallback)),
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdoutBytes,
        stderrBytes,
        durationMs: Math.max(0, Date.now() - startedAt),
        nativeCrash: nativeCrashFor(exitCode, this.platform)
      });

      const addCleanupFailure = (primary, cleanupError, process) => {
        const cleanupDetails = {
          temporaryDirectory,
          cleanupError: diagnostic(cleanupError)
        };
        if (!primary) {
          return executionError(
            "RUNTIME_TEMP_CLEANUP_FAILED",
            "Runtime temporary directory cleanup failed",
            { ...cleanupDetails, process }
          );
        }
        primary.details.cleanupError = cleanupDetails.cleanupError;
        primary.details.temporaryDirectory = temporaryDirectory;
        return primary;
      };

      const finish = (exitCode = null, signal = null, spawnError = null) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        const process = processResult(exitCode, signal, spawnError ? "spawn-error" : "exit");
        let primary = null;

        if (spawnError) {
          primary = executionError("RUNTIME_SPAWN_FAILED", "Runtime process failed to start", {
            error: diagnostic(spawnError), process
          });
        } else if (termination === "timeout") {
          primary = executionError("RUNTIME_TIMEOUT", "Runtime process timed out", {
            timeoutMs: this.timeoutMs,
            ...(terminationError ? { terminationError: diagnostic(terminationError) } : {}),
            process
          });
        } else if (termination === "stdout-limit" || termination === "stderr-limit") {
          const stream = termination.slice(0, -6);
          primary = executionError("RUNTIME_OUTPUT_LIMIT", `Runtime ${stream} exceeded its byte limit`, {
            stream,
            limit: stream === "stdout" ? this.maxStdoutBytes : this.maxStderrBytes,
            ...(terminationError ? { terminationError: diagnostic(terminationError) } : {}),
            process
          });
        } else if (process.signal || process.nativeCrash
          || (this.platform === "win32" && process.exitCode === 3
            && /^Fatal Python error:/m.test(process.stderr))) {
          primary = executionError("RUNTIME_NATIVE_CRASH", "Runtime process terminated abnormally", {
            signal: process.signal,
            exitCode: process.exitCode,
            nativeCrash: process.nativeCrash,
            process
          });
        } else if (process.exitCode !== null && process.exitCode !== 0) {
          primary = executionError("RUNTIME_PROCESS_EXITED", "Runtime process exited unsuccessfully", {
            exitCode: process.exitCode, process
          });
        } else if (stdinError) {
          primary = executionError("RUNTIME_STDIN_FAILED", "Runtime process could not receive input", {
            error: diagnostic(stdinError), process
          });
        } else if (process.stdout.trim().length === 0) {
          primary = executionError("RUNTIME_PROTOCOL_EMPTY", "Runtime process returned empty output", { process });
        }

        let response;
        if (!primary) {
          try {
            response = JSON.parse(process.stdout);
          } catch (_error) {
            primary = executionError("RUNTIME_PROTOCOL_INVALID", "Runtime process returned invalid JSON", {
              reason: "invalid-json", process
            });
          }
        }
        if (!primary && (!isPlainObject(response) || typeof response.ok !== "boolean"
          || (response.ok && (!isPlainObject(response.runtime)
            || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(response.runtime.version)
            || response.runtime.architecture !== "64bit"
            || typeof response.runtime.executable !== "string"
            || response.runtime.executable !== response.runtime.executable.trim()
            || !path.isAbsolute(response.runtime.executable)))
          || (!response.ok && (!isPlainObject(response.error)
            || [response.error.code, response.error.type, response.error.message]
              .some((value) => typeof value !== "string" || value.trim().length === 0))))) {
          primary = executionError("RUNTIME_PROTOCOL_INVALID", "Runtime process returned an invalid envelope", {
            reason: "invalid-envelope", process
          });
        }
        if (!primary && !response.ok) {
          primary = executionError("RUNTIME_BOOTSTRAP_FAILED", "Runtime Bootstrap reported a failure", {
            bootstrapError: response.error, process
          });
        }

        let cleanupError = null;
        if (temporaryDirectory) {
          try {
            this.fileSystem.rmSync(temporaryDirectory, { recursive: true, force: true });
          } catch (error) {
            cleanupError = error;
          }
        }
        if (cleanupError) primary = addCleanupFailure(primary, cleanupError, process);

        if (primary) reject(primary);
        else resolve({ response, process });
      };

      const stop = (reason) => {
        if (termination) return;
        termination = reason;
        if (!killed) {
          killed = true;
          try {
            if (!child.kill("SIGKILL")) {
              terminationError = new Error("Runtime process termination was not acknowledged");
            }
          } catch (error) {
            terminationError = error;
          }
        }
      };

      const capture = (name, chunk) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const limit = name === "stdout" ? this.maxStdoutBytes : this.maxStderrBytes;
        if (name === "stdout") {
          stdoutBytes += bytes.length;
          const retained = Math.min(bytes.length, Math.max(0, limit - stdoutRetained));
          if (retained) stdoutChunks.push(Buffer.from(bytes.subarray(0, retained)));
          stdoutRetained += retained;
          if (stdoutBytes > limit) stop("stdout-limit");
        } else {
          stderrBytes += bytes.length;
          const retained = Math.min(bytes.length, Math.max(0, limit - stderrRetained));
          if (retained) stderrChunks.push(Buffer.from(bytes.subarray(0, retained)));
          stderrRetained += retained;
          if (stderrBytes > limit) stop("stderr-limit");
        }
      };

      try {
        temporaryDirectory = this.fileSystem.mkdtempSync(
          path.join(this.temporaryRoot, "clackly-runtime-")
        );
        const environment = createRuntimeEnvironment({
          parentEnvironment: this.parentEnvironment,
          temporaryDirectory,
          platform: this.platform
        });
        const executable = this.validateFile(
          resolution.executable,
          "RUNTIME_EXECUTABLE_INVALID",
          "Runtime executable"
        );
        child = this.spawnProcess(executable, ["-I", "-u", "-X", "faulthandler", bootstrapPath], {
          shell: false,
          windowsHide: true,
          cwd: temporaryDirectory,
          env: environment,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        if (error instanceof RuntimeError) {
          let primary = error;
          if (temporaryDirectory) {
            try {
              this.fileSystem.rmSync(temporaryDirectory, { recursive: true, force: true });
            } catch (cleanupError) {
              primary.details.cleanupError = diagnostic(cleanupError);
              primary.details.temporaryDirectory = temporaryDirectory;
            }
          }
          settled = true;
          reject(primary);
        } else {
          finish(null, null, error);
        }
        return;
      }

      child.once("error", (error) => {
        if (termination) terminationError = error;
        else {
          spawnError = error;
          termination = "spawn-error";
        }
      });
      child.stdout.on("data", (chunk) => capture("stdout", chunk));
      child.stderr.on("data", (chunk) => capture("stderr", chunk));
      child.stdin.once("error", (error) => { stdinError = error; });
      child.once("close", (code, signal) => finish(code, signal, spawnError));
      timer = setTimeout(() => stop("timeout"), this.timeoutMs);

      try {
        child.stdin.end(serializedRequest);
      } catch (error) {
        stdinError = error;
      }
    });
  }
}

module.exports = { RuntimeLauncher };
