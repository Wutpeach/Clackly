const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { TextDecoder } = require("node:util");
const { performance } = require("node:perf_hooks");
const { createRuntimeEnvironment } = require("./environment");
const { RuntimeError } = require("./errors");
const { isNativePythonCrash, nativeCrashFor, serializeRequest } = require("./launcher");

const PROTOCOL = "clackly-persistent-python/1";
const DEFAULT_STARTUP_TIMEOUT_MS = 5_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;
// The business response carries the private desktop launch directive.  Its JSX
// is already allowed to occupy most of RuntimeLauncher's 1 MiB stdout budget,
// so the persistent framing must accept that same bounded envelope class.
const DEFAULT_MAX_LINE_BYTES = DEFAULT_MAX_BYTES;
const DEFAULT_QUEUE_LIMIT = 32;
const MAX_REQUEST_ID = Number.MAX_SAFE_INTEGER;
const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function isPlainObject(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch (_error) {
    return false;
  }
}

function persistentError(code, message, details = {}) {
  return new RuntimeError(code, message, { details });
}

function validRequestId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function exactKeys(value, keys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validRuntime(value) {
  return exactKeys(value, ["architecture", "executable", "version"])
    && VERSION.test(value.version || "")
    && value.architecture === "64bit"
    && typeof value.executable === "string" && path.isAbsolute(value.executable);
}

function validBootstrapError(value) {
  return exactKeys(value, ["code", "message", "type"]) && [value.code, value.type, value.message]
    .every((item) => typeof item === "string" && item.trim().length > 0);
}

function validReady(value) {
  return exactKeys(value, ["protocol", "runtime", "type"])
    && value.protocol === PROTOCOL && value.type === "ready" && validRuntime(value.runtime);
}

function processRecord(session, active, now) {
  // Startup diagnostics are kept separately from request diagnostics.  An idle
  // worker never contributes stderr to a later request's process record.
  const diagnostics = active || session;
  return {
    exitCode: Number.isSafeInteger(session.exitCode) ? session.exitCode : null,
    signal: typeof session.signal === "string" ? session.signal.slice(0, 128) : null,
    termination: session.termination || "running",
    stdout: "",
    stderr: diagnostics?.stderrChunks?.length ? Buffer.concat(diagnostics.stderrChunks).toString("utf8") : "",
    stdoutBytes: active?.stdoutBytes || 0,
    stderrBytes: diagnostics?.stderrBytes || 0,
    durationMs: Math.max(0, Math.round((now() - (active?.startedAt || session.startedAt)) * 1000) / 1000),
    nativeCrash: nativeCrashFor(session.exitCode, session.platform)
  };
}

/**
 * Managed-Python Export-to-AE worker. RuntimeLauncher deliberately remains a
 * one-shot primitive for Runtime Probe and every unrelated script; this
 * protocol is injected solely into RuntimeManager's Windows Export-to-AE seam.
 */
class PersistentScriptLauncher {
  constructor({
    bootstrapPath = path.resolve(__dirname, "persistent_bootstrap.py"),
    startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxStdoutBytes = DEFAULT_MAX_BYTES,
    maxStderrBytes = DEFAULT_MAX_BYTES,
    maxLineBytes = DEFAULT_MAX_LINE_BYTES,
    queueLimit = DEFAULT_QUEUE_LIMIT,
    parentEnvironment = process.env,
    platform = process.platform,
    temporaryRoot = os.tmpdir(),
    fileSystem = fs,
    spawnProcess = spawn,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    now = () => performance.now()
  } = {}) {
    for (const [field, value] of Object.entries({
      startupTimeoutMs, timeoutMs, maxStdoutBytes, maxStderrBytes, maxLineBytes, queueLimit
    })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime requires positive integer limits", { field });
      }
    }
    if (typeof bootstrapPath !== "string" || !path.isAbsolute(bootstrapPath)
      || typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)
      || typeof spawnProcess !== "function" || typeof setTimer !== "function"
      || typeof clearTimer !== "function" || typeof now !== "function") {
      throw persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime dependencies are invalid", { field: "constructor" });
    }
    this.bootstrapPath = bootstrapPath;
    this.startupTimeoutMs = startupTimeoutMs;
    this.timeoutMs = timeoutMs;
    this.maxStdoutBytes = maxStdoutBytes;
    this.maxStderrBytes = maxStderrBytes;
    this.maxLineBytes = maxLineBytes;
    this.queueLimit = queueLimit;
    this.parentEnvironment = parentEnvironment;
    this.platform = platform;
    this.temporaryRoot = temporaryRoot;
    this.fileSystem = fileSystem;
    this.spawnProcess = spawnProcess;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.session = null;
    this.active = null;
    this.queue = [];
    this.nextRequestId = 1;
    this.starting = null;
    this.prewarmPromise = null;
    this.disposed = false;
    this.workerGeneration = 0;
  }

  validateFile(candidate, code, label) {
    if (typeof candidate !== "string" || candidate.trim().length === 0
      || candidate !== candidate.trim() || !path.isAbsolute(candidate)) {
      throw persistentError(code, `${label} must be one absolute file path`, { field: label.toLowerCase() });
    }
    try {
      const canonical = this.fileSystem.realpathSync(candidate);
      if (!path.isAbsolute(canonical) || !this.fileSystem.statSync(canonical).isFile()) throw new Error("not file");
      return canonical;
    } catch (_error) {
      throw persistentError(code, `${label} must be an existing regular file`, { field: label.toLowerCase() });
    }
  }

  validateInput(input, { prepare = false } = {}) {
    if (!isPlainObject(input) || !isPlainObject(input.resolution)
      || !["manifest", "override"].includes(input.resolution.source)) {
      throw persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime requires a Resolver-shaped resolution", { field: "resolution" });
    }
    const executable = this.validateFile(input.resolution.executable, "RUNTIME_EXECUTABLE_INVALID", "Runtime executable");
    const bootstrapPath = this.validateFile(
      Object.hasOwn(input, "bootstrapPath") ? input.bootstrapPath : this.bootstrapPath,
      "RUNTIME_LAUNCH_REQUEST_INVALID",
      "Bootstrap path"
    );
    if (typeof input.healthKey !== "string" || !input.healthKey || input.healthKey.length > 4096
      || typeof input.identity !== "string" || !input.identity || input.identity.length > 4096) {
      throw persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime requires bounded worker health", { field: "healthKey" });
    }
    const request = input.request;
    if (!isPlainObject(request)) {
      throw persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime requires a script request", { field: "request" });
    }
    const required = prepare ? ["operation", "scriptRoot", "entry"]
      : ["operation", "scriptRoot", "entry", "commandId", "config"];
    if (request.operation !== (prepare ? "prepare" : "script-execute")
      || !exactKeys(request, required)) {
      throw persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime request has an invalid operation", { field: "request.operation" });
    }
    serializeRequest(request);
    return {
      resolution: { ...input.resolution, executable },
      bootstrapPath,
      healthKey: input.healthKey,
      identity: input.identity,
      request: structuredClone(request),
      kind: prepare ? "prepare" : "execute"
    };
  }

  execute(input = {}) {
    if (this.disposed) return Promise.reject(persistentError("RUNTIME_PROCESS_EXITED", "Persistent Runtime has been disposed", { reason: "disposed" }));
    let job;
    try {
      job = this.validateInput(input);
    } catch (error) {
      return Promise.reject(error instanceof RuntimeError ? error
        : persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime request must be JSON serializable", { field: "request" }));
    }
    return this.enqueue(job);
  }

  prewarm(input = {}) {
    if (this.platform !== "win32" || this.disposed) return Promise.resolve(false);
    if (this.prewarmPromise) return this.prewarmPromise;
    let job;
    try {
      job = this.validateInput({ ...input, request: { operation: "prepare", scriptRoot: input.scriptRoot, entry: input.entry } }, { prepare: true });
    } catch (error) {
      return Promise.reject(error);
    }
    const warming = this.enqueue(job).then(() => true);
    this.prewarmPromise = warming;
    warming.then(
      () => { if (this.prewarmPromise === warming) this.prewarmPromise = null; },
      () => { if (this.prewarmPromise === warming) this.prewarmPromise = null; }
    );
    return warming;
  }

  enqueue(job) {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(persistentError("RUNTIME_PROCESS_EXITED", "Persistent Runtime has been disposed", { reason: "disposed" }));
        return;
      }
      if (this.queue.length >= this.queueLimit) {
        reject(persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime request queue is full", { reason: "queue-full" }));
        return;
      }
      this.queue.push({ ...job, resolve, reject });
      this.drain();
    });
  }

  drain() {
    if (this.active || this.starting || this.queue.length === 0 || this.disposed) return;
    const job = this.queue[0];
    this.starting = this.ensureSession(job);
    this.starting.then(() => {
      this.starting = null;
      if (!this.disposed && !this.active && this.queue[0] === job && this.session?.ready) this.sendNext(this.session);
    }, () => { this.starting = null; });
  }

  sessionMatches(session, job) {
    if (!session?.ready || session.failed) return false;
    if (session.healthKey === job.healthKey) return true;
    // A no-host prewarm carries only canonical interpreter identity.  It is
    // adopted after the normal Resolve Probe yields the full live health key.
    if (session.prewarmed && session.identity === job.identity) {
      session.healthKey = job.healthKey;
      session.prewarmed = false;
      session.reportPrewarmed = true;
      return true;
    }
    return false;
  }

  ensureSession(job) {
    if (this.sessionMatches(this.session, job)) return Promise.resolve(this.session);
    if (this.session) {
      const previous = this.session;
      previous.replacing = true;
      this.terminate(previous, persistentError(
        "RUNTIME_PROCESS_EXITED",
        "Persistent Runtime worker identity changed",
        { reason: "health-changed" }
      ));
      // No request has been written yet: replacing for live health is not a
      // retry of user work. The queued request dispatches on the new worker.
      return previous.closePromise.then(() => this.startSession(job));
    }
    return this.startSession(job);
  }

  startSession(job) {
    let temporaryDirectory;
    let child;
    let executable;
    try {
      temporaryDirectory = this.fileSystem.mkdtempSync(path.join(this.temporaryRoot, "clackly-persistent-runtime-"));
      executable = this.validateFile(job.resolution.executable, "RUNTIME_EXECUTABLE_INVALID", "Runtime executable");
      const environment = createRuntimeEnvironment({
        parentEnvironment: this.parentEnvironment,
        temporaryDirectory,
        platform: this.platform
      });
      child = this.spawnProcess(executable, ["-I", "-u", "-X", "faulthandler", job.bootstrapPath], {
        shell: false,
        windowsHide: true,
        cwd: temporaryDirectory,
        env: environment,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      if (temporaryDirectory) {
        try { this.fileSystem.rmSync(temporaryDirectory, { recursive: true, force: true }); } catch (_cleanupError) {}
      }
      const failure = error instanceof RuntimeError ? error
        : persistentError("RUNTIME_SPAWN_FAILED", "Persistent Runtime process failed to start", { reason: "spawn-threw" });
      this.rejectAll(failure);
      return Promise.reject(failure);
    }
    if (!child || typeof child.once !== "function" || !child.stdin || typeof child.stdin.write !== "function"
      || !child.stdout || typeof child.stdout.on !== "function" || !child.stderr || typeof child.stderr.on !== "function") {
      const failure = persistentError("RUNTIME_SPAWN_FAILED", "Persistent Runtime process has invalid stdio", { reason: "invalid-child-stdio" });
      try { child?.kill?.("SIGKILL"); } catch (_error) {}
      try { this.fileSystem.rmSync(temporaryDirectory, { recursive: true, force: true }); } catch (_error) {}
      this.rejectAll(failure);
      return Promise.reject(failure);
    }
    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    readyPromise.catch(() => {});
    const session = {
      child,
      executable,
      temporaryDirectory,
      bootstrapPath: job.bootstrapPath,
      healthKey: job.kind === "prepare" ? null : job.healthKey,
      identity: job.identity,
      prewarmed: job.kind === "prepare",
      reportPrewarmed: false,
      generation: this.workerGeneration + 1,
      platform: this.platform,
      ready: false,
      failed: null,
      closed: false,
      buffer: Buffer.alloc(0),
      startupBytes: 0,
      stderrBytes: 0,
      stderrRetained: 0,
      stderrChunks: [],
      startedAt: this.now(),
      startupTimer: null,
      resolveReady,
      rejectReady,
      readyPromise,
      closePromise: null,
      resolveClose: null,
      exitCode: null,
      signal: null,
      termination: null
    };
    this.workerGeneration = session.generation;
    session.closePromise = new Promise((resolve) => { session.resolveClose = resolve; });
    this.session = session;
    session.startupTimer = this.setTimer(() => this.terminate(
      session,
      persistentError("RUNTIME_TIMEOUT", "Persistent Runtime startup timed out", { timeoutMs: this.startupTimeoutMs, reason: "startup-timeout" })
    ), this.startupTimeoutMs);
    child.stdout.on("data", (chunk) => this.receive(session, chunk));
    child.stderr.on("data", (chunk) => this.receiveStderr(session, chunk));
    child.stdout.once("error", () => this.terminate(session, persistentError("RUNTIME_PROCESS_EXITED", "Persistent Runtime stdout failed", { reason: "stdout-error" })));
    child.stdout.once("end", () => this.terminate(session, persistentError("RUNTIME_PROCESS_EXITED", "Persistent Runtime stdout ended", { reason: "stdout-end" })));
    child.stdin.once("error", () => this.terminate(session, persistentError("RUNTIME_STDIN_FAILED", "Persistent Runtime stdin failed", { reason: "stdin-error" })));
    child.once("error", () => this.terminate(session, persistentError("RUNTIME_SPAWN_FAILED", "Persistent Runtime process failed", { reason: "child-error" })));
    child.once("close", (code, signal) => this.closed(session, code, signal));
    return readyPromise;
  }

  receive(session, chunk) {
    if (session !== this.session || session.failed) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (session.ready && this.active?.session === session) this.active.stdoutBytes += bytes.length;
    else session.startupBytes += bytes.length;
    if ((session.ready && this.active?.stdoutBytes > this.maxStdoutBytes)
      || (!session.ready && session.startupBytes > this.maxStdoutBytes)) {
      this.terminate(session, persistentError("RUNTIME_OUTPUT_LIMIT", "Persistent Runtime stdout exceeded its byte limit", { stream: "stdout", limit: this.maxStdoutBytes }));
      return;
    }
    session.buffer = Buffer.concat([session.buffer, bytes]);
    if (session.buffer.length > this.maxLineBytes) {
      this.terminate(session, persistentError("RUNTIME_OUTPUT_LIMIT", "Persistent Runtime response exceeded its line limit", { stream: "stdout", limit: this.maxLineBytes }));
      return;
    }
    let newline;
    while ((newline = session.buffer.indexOf(0x0a)) !== -1) {
      const lineBytes = session.buffer.subarray(0, newline);
      session.buffer = session.buffer.subarray(newline + 1);
      try {
        const clean = lineBytes.at(-1) === 0x0d ? lineBytes.subarray(0, -1) : lineBytes;
        this.receiveLine(session, new TextDecoder("utf-8", { fatal: true }).decode(clean));
      } catch (_error) {
        this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned invalid protocol output", { reason: "non-utf8-output" }));
      }
      if (session.failed) return;
    }
  }

  receiveStderr(session, chunk) {
    if (session !== this.session || session.failed) return;
    const active = this.active?.session === session ? this.active : null;
    // Stderr before READY is the only startup diagnostic we retain.  Do not
    // carry idle output from one request into another request's diagnostics.
    const diagnostics = active || (!session.ready ? session : null);
    if (!diagnostics) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    diagnostics.stderrBytes += bytes.length;
    const retained = Math.min(bytes.length, Math.max(0, this.maxStderrBytes - diagnostics.stderrRetained));
    if (retained) diagnostics.stderrChunks.push(Buffer.from(bytes.subarray(0, retained)));
    diagnostics.stderrRetained += retained;
    if (diagnostics.stderrBytes > this.maxStderrBytes) {
      this.terminate(session, persistentError("RUNTIME_OUTPUT_LIMIT", "Persistent Runtime stderr exceeded its byte limit", { stream: "stderr", limit: this.maxStderrBytes }));
    }
  }

  receiveLine(session, line) {
    if (!session.ready) {
      let ready;
      try { ready = JSON.parse(line); } catch (_error) { ready = null; }
      if (!validReady(ready)) {
        this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned an invalid READY envelope", { reason: "invalid-ready" }));
        return;
      }
      session.ready = true;
      this.clearTimer(session.startupTimer);
      session.startupTimer = null;
      session.resolveReady(session);
      return;
    }
    const active = this.active;
    if (!active || active.session !== session) {
      this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned an unexpected response", { reason: "unexpected-response" }));
      return;
    }
    let response;
    try { response = JSON.parse(line); } catch (_error) { response = null; }
    if (!isPlainObject(response) || response.requestId !== active.requestId || !validRequestId(response.requestId)) {
      this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned an invalid response", { reason: "wrong-or-malformed-request-id" }));
      return;
    }
    if (active.kind === "prepare") {
      if (!exactKeys(response, ["ok", "prepared", "requestId"]) || response.ok !== true || response.prepared !== true) {
        this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned an invalid PREPARED envelope", { reason: "invalid-prepared" }));
        return;
      }
    } else if (response.ok === true) {
      if (!exactKeys(response, ["ok", "requestId", "runtime", "script"]) || !validRuntime(response.runtime) || !isPlainObject(response.script)) {
        this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned an invalid script envelope", { reason: "invalid-script-envelope" }));
        return;
      }
    } else if (!exactKeys(response, ["error", "ok", "requestId"]) || response.ok !== false || !validBootstrapError(response.error)) {
      this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime returned an invalid failure envelope", { reason: "invalid-failure-envelope" }));
      return;
    }
    const restartAfterResolveFailure = active.kind === "execute" && response.ok === true
      && response.script?.ok === false && response.script?.error?.type === "ResolveAdapterError";
    this.active = null;
    this.clearTimer(active.timer);
    if (restartAfterResolveFailure) {
      const workerState = session.reportPrewarmed ? "prewarmed"
        : session.generation > 1 ? "restarted" : "warm";
      session.reportPrewarmed = false;
      // Settle this script envelope only after close cleanup clears the dead
      // session.  A caller that immediately issues its next command therefore
      // cannot enqueue it against the dying native-import process.
      session.retiredResponse = {
        active,
        result: {
          response: { ok: true, runtime: response.runtime, script: response.script },
          process: processRecord(session, active, this.now),
          worker: { state: workerState, restarted: workerState === "restarted" }
        }
      };
      this.terminate(session, persistentError(
        "RUNTIME_PROCESS_EXITED",
        "Persistent Runtime worker lost Resolve connectivity",
        { reason: "script-resolve-failure" }
      ));
      return;
    }
    if (response.ok === false) {
      active.reject(persistentError("RUNTIME_BOOTSTRAP_FAILED", "Runtime Bootstrap reported a failure", {
        bootstrapError: response.error,
        process: processRecord(session, active, this.now)
      }));
    } else if (active.kind === "prepare") {
      active.resolve({ prepared: true, process: processRecord(session, active, this.now), worker: { state: "prewarmed", restarted: false } });
    } else {
      const workerState = session.reportPrewarmed ? "prewarmed"
        : session.generation > 1 ? "restarted" : "warm";
      session.reportPrewarmed = false;
      active.resolve({
        response: { ok: true, runtime: response.runtime, script: response.script },
        process: processRecord(session, active, this.now),
        worker: { state: workerState, restarted: workerState === "restarted" }
      });
    }
    this.drain();
  }

  sendNext(session) {
    if (session !== this.session || !session.ready || this.active || this.disposed || this.queue.length === 0) return;
    if (!validRequestId(this.nextRequestId) || this.nextRequestId > MAX_REQUEST_ID) {
      this.terminate(session, persistentError("RUNTIME_PROTOCOL_INVALID", "Persistent Runtime request ids are exhausted", { reason: "request-id-exhausted" }));
      return;
    }
    const job = this.queue.shift();
    const requestId = this.nextRequestId++;
    let frame;
    try {
      frame = `${serializeRequest({ requestId, ...job.request })}\n`;
      if (Buffer.byteLength(frame, "utf8") > this.maxLineBytes) throw new Error("request too large");
    } catch (_error) {
      job.reject(persistentError("RUNTIME_LAUNCH_REQUEST_INVALID", "Persistent Runtime request exceeded protocol bounds", { field: "request" }));
      this.drain();
      return;
    }
    const active = {
      ...job,
      requestId,
      session,
      startedAt: this.now(),
      stdoutBytes: 0,
      stderrBytes: 0,
      stderrRetained: 0,
      stderrChunks: [],
      timer: null
    };
    this.active = active;
    active.timer = this.setTimer(() => this.terminate(
      session,
      persistentError("RUNTIME_TIMEOUT", "Runtime process timed out", { timeoutMs: this.timeoutMs, reason: "request-timeout" })
    ), this.timeoutMs);
    try {
      session.child.stdin.write(frame, "utf8", (error) => {
        if (error) this.terminate(session, persistentError("RUNTIME_STDIN_FAILED", "Runtime process could not receive input", { reason: "stdin-write-error" }));
      });
    } catch (_error) {
      this.terminate(session, persistentError("RUNTIME_STDIN_FAILED", "Runtime process could not receive input", { reason: "stdin-write-threw" }));
    }
  }

  terminate(session, error) {
    if (!session || session.failed) return;
    session.failed = error;
    session.termination = error?.details?.reason || "failed";
    if (session.startupTimer) this.clearTimer(session.startupTimer);
    if (this.active?.session === session) this.clearTimer(this.active.timer);
    try { session.child.stdin.end(); } catch (_error) {}
    try { session.child.kill("SIGKILL"); } catch (_error) {}
    // Some fake/spawn failures have no close event.  The real child always
    // closes; this fallback only handles already-closed handles safely.
    if (session.closed) this.closed(session, session.exitCode, session.signal);
  }

  closed(session, code, signal) {
    if (!session || session.closed && session.settled) return;
    session.closed = true;
    session.exitCode = Number.isSafeInteger(code) ? code : null;
    session.signal = typeof signal === "string" ? signal : null;
    if (!session.failed) {
      const active = this.active?.session === session ? this.active : null;
      const process = processRecord(session, active, this.now);
      const nativePythonCrash = isNativePythonCrash({
        exitCode: process.exitCode,
        signal: process.signal,
        stderr: process.stderr,
        platform: session.platform
      });
      session.failed = persistentError(
        nativePythonCrash ? "RUNTIME_NATIVE_CRASH" : "RUNTIME_PROCESS_EXITED",
        nativePythonCrash ? "Runtime process terminated abnormally" : "Runtime process exited unexpectedly",
        { process }
      );
      session.termination = "child-close";
    }
    if (session.settled) return;
    session.settled = true;
    if (session.startupTimer) this.clearTimer(session.startupTimer);
    try { this.fileSystem.rmSync(session.temporaryDirectory, { recursive: true, force: true }); } catch (_error) {}
    session.resolveClose?.();
    if (!session.ready) session.rejectReady(session.failed);
    if (this.active?.session === session) {
      const active = this.active;
      this.active = null;
      this.clearTimer(active.timer);
      if (!active.kind || active.kind === "execute") {
        const error = session.failed instanceof RuntimeError ? session.failed
          : persistentError("RUNTIME_PROCESS_EXITED", "Runtime process exited unexpectedly");
        if (!error.details.process) error.details.process = processRecord(session, active, this.now);
        active.reject(error);
      } else {
        active.reject(session.failed);
      }
    }
    // Reject work that was already waiting on this worker before clearing the
    // session and resolving a retiring Resolve-failure envelope.  New callers
    // only observe the settlement after the dead worker is no longer visible.
    if (!session.replacing) this.rejectAll(session.failed);
    if (this.session === session) this.session = null;
    if (session.retiredResponse) {
      const retiring = session.retiredResponse;
      session.retiredResponse = null;
      retiring.active.resolve(retiring.result);
    }
    this.drain();
  }

  rejectAll(error) {
    const pending = this.queue.splice(0);
    for (const job of pending) job.reject(error);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const error = persistentError("RUNTIME_PROCESS_EXITED", "Persistent Runtime has been disposed", { reason: "disposed" });
    this.rejectAll(error);
    if (this.session) this.terminate(this.session, error);
  }
}

module.exports = {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINE_BYTES,
  DEFAULT_QUEUE_LIMIT,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  PROTOCOL,
  PersistentScriptLauncher
};
