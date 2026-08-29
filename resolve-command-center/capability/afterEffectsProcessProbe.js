const path = require("node:path");
const { spawn: defaultSpawn } = require("node:child_process");
const { TextDecoder } = require("node:util");

const PROCESS_PROBE_STARTUP_TIMEOUT_MS = 5000;
const PROCESS_PROBE_QUERY_TIMEOUT_MS = 5000;
const PROCESS_PROBE_MAX_RESPONSE_BYTES = 1024 * 1024;
const PROCESS_PROBE_MAX_RECORDS = 256;
const READY_LINE = "CLACKLY_AE_PROCESS_PROBE_READY/1";
const ENUMERATION_FAILED = "enumeration-failed";

// This helper accepts only a generated numeric request id. The configured AE
// executable, JSX, and host configuration never cross its stdin boundary.
const HELPER_SCRIPT = [
  "$utf8 = [System.Text.UTF8Encoding]::new($false)",
  "[Console]::InputEncoding = $utf8",
  "[Console]::OutputEncoding = $utf8",
  "$ErrorActionPreference = 'Stop'",
  `[Console]::Out.WriteLine('${READY_LINE}')`,
  "[Console]::Out.Flush()",
  "while (($line = [Console]::In.ReadLine()) -ne $null) {",
  "  if ($line -notmatch '^QUERY ([1-9][0-9]*)$') { break }",
  "  $requestId = [Int64]$Matches[1]",
  "  try {",
  "    $records = @(Get-Process -Name AfterFX -ErrorAction SilentlyContinue | ForEach-Object {",
  "      $candidate = $null",
  "      try { $candidate = $_.Path } catch {}",
  "      if ([string]::IsNullOrWhiteSpace([string]$candidate)) {",
  "        [PSCustomObject]@{ status = 'unresolved' }",
  "      } else {",
  "        [PSCustomObject]@{ path = [string]$candidate; status = 'ok' }",
  "      }",
  "    })",
  "    $payload = [PSCustomObject]@{ requestId = $requestId; processCount = @($records).Count; records = @($records) }",
  "  } catch {",
  `    $payload = [PSCustomObject]@{ requestId = $requestId; error = '${ENUMERATION_FAILED}' }`,
  "  }",
  "  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 3))",
  "  [Console]::Out.Flush()",
  "}"
].join("\n");

function probeError(reason) {
  return Object.assign(new Error("After Effects process probe failed"), {
    code: "AFTER_EFFECTS_PROCESS_PROBE_FAILED",
    details: { reason }
  });
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validRequestId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function encodedHelperScript() {
  return Buffer.from(HELPER_SCRIPT, "utf16le").toString("base64");
}

function powerShellPath(hostEnvironment) {
  const systemRoot = Object.entries(hostEnvironment)
    .find(([key]) => key.toLowerCase() === "systemroot")?.[1];
  if (typeof systemRoot !== "string" || !systemRoot.trim()) return null;
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function validateResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !validRequestId(payload.requestId)) {
    throw probeError("malformed-response");
  }

  if (Object.hasOwn(payload, "error")) {
    if (!exactKeys(payload, ["error", "requestId"])
      || payload.error !== ENUMERATION_FAILED) {
      throw probeError("malformed-response");
    }
    return { requestId: payload.requestId, error: payload.error };
  }

  if (!exactKeys(payload, ["processCount", "records", "requestId"])
    || !Number.isSafeInteger(payload.processCount)
    || payload.processCount < 0 || payload.processCount > PROCESS_PROBE_MAX_RECORDS
    || !Array.isArray(payload.records)
    || payload.records.length !== payload.processCount) {
    throw probeError("malformed-response");
  }

  const records = payload.records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || typeof record.status !== "string") {
      throw probeError("malformed-record");
    }
    if (record.status === "ok") {
      if (!exactKeys(record, ["path", "status"])
        || typeof record.path !== "string" || record.path.length === 0
        || record.path.includes("\0")) {
        throw probeError("malformed-record");
      }
      return { status: "ok", path: record.path };
    }
    if (record.status === "unresolved" && exactKeys(record, ["status"])) {
      return { status: "unresolved" };
    }
    throw probeError("malformed-record");
  });

  return { requestId: payload.requestId, processCount: payload.processCount, records };
}

class WindowsAfterEffectsProcessProbe {
  constructor({
    hostEnvironment = process.env,
    platform = process.platform,
    spawnProcess = defaultSpawn,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    startupTimeoutMs = PROCESS_PROBE_STARTUP_TIMEOUT_MS,
    queryTimeoutMs = PROCESS_PROBE_QUERY_TIMEOUT_MS
  } = {}) {
    if (!hostEnvironment || typeof hostEnvironment !== "object"
      || typeof spawnProcess !== "function"
      || typeof setTimer !== "function" || typeof clearTimer !== "function"
      || !Number.isSafeInteger(startupTimeoutMs) || startupTimeoutMs < PROCESS_PROBE_STARTUP_TIMEOUT_MS
      || !Number.isSafeInteger(queryTimeoutMs) || queryTimeoutMs < PROCESS_PROBE_QUERY_TIMEOUT_MS) {
      throw new TypeError("After Effects process probe requires bounded host process dependencies");
    }
    this.hostEnvironment = hostEnvironment;
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.startupTimeoutMs = startupTimeoutMs;
    this.queryTimeoutMs = queryTimeoutMs;
    this.child = null;
    this.session = null;
    this.startupPromise = null;
    this.prewarmPromise = null;
    this.queue = [];
    this.active = null;
    this.draining = false;
    this.nextRequestId = 1;
    this.disposed = false;
  }

  prewarm() {
    if (this.platform !== "win32" || this.disposed) return Promise.resolve(false);
    if (this.prewarmPromise) return this.prewarmPromise;

    // This is deliberately a real fresh query, not an AE-state cache. Its
    // response is discarded so every user export still receives its own later
    // enumeration through query().
    const warming = this.query().then(() => true);
    this.prewarmPromise = warming;
    warming.then(
      () => { if (this.prewarmPromise === warming) this.prewarmPromise = null; },
      () => { if (this.prewarmPromise === warming) this.prewarmPromise = null; }
    );
    return warming;
  }

  query() {
    if (this.platform !== "win32") {
      return Promise.resolve({ processCount: 0, records: [] });
    }
    if (this.disposed) return Promise.reject(probeError("disposed"));
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.drain();
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.session) this.failSession(this.session, probeError("disposed"));
    else this.rejectPending(probeError("disposed"));
  }

  ensureStarted() {
    if (this.platform !== "win32") return Promise.resolve();
    if (this.disposed) return Promise.reject(probeError("disposed"));
    if (this.session?.ready) return Promise.resolve();
    if (this.startupPromise) return this.startupPromise;

    const powershell = powerShellPath(this.hostEnvironment);
    if (!powershell) {
      const error = probeError("missing-system-root");
      this.rejectPending(error);
      const rejected = Promise.reject(error);
      rejected.catch(() => {});
      return rejected;
    }

    let resolveStartup;
    let rejectStartup;
    const startupPromise = new Promise((resolve, reject) => {
      resolveStartup = resolve;
      rejectStartup = reject;
    });
    // A host intentionally ignores background prewarm failure. Mark the
    // internal promise handled while retaining rejection for explicit callers.
    startupPromise.catch(() => {});
    this.startupPromise = startupPromise;

    let child;
    try {
      child = this.spawnProcess(powershell, [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedHelperScript()
      ], {
        env: this.hostEnvironment,
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "ignore"]
      });
    } catch (_error) {
      this.startupPromise = null;
      const error = probeError("spawn-threw");
      rejectStartup(error);
      this.rejectPending(error);
      return startupPromise;
    }

    if (!child || typeof child.once !== "function" || !child.stdin
      || typeof child.stdin.write !== "function" || !child.stdout
      || typeof child.stdout.on !== "function") {
      const invalidSession = { child, ready: false, rejectStartup };
      this.child = child;
      this.session = invalidSession;
      this.failSession(invalidSession, probeError("invalid-child-stdio"));
      return startupPromise;
    }

    const session = {
      child,
      ready: false,
      failed: false,
      buffer: Buffer.alloc(0),
      startupTimer: null,
      resolveStartup,
      rejectStartup
    };
    this.child = child;
    this.session = session;
    session.startupTimer = this.setTimer(() => {
      this.failSession(session, probeError("startup-timeout"));
    }, this.startupTimeoutMs);

    child.stdout.on("data", (chunk) => this.receive(session, chunk));
    child.stdout.once("error", () => this.failSession(session, probeError("stdout-error")));
    child.stdout.once("end", () => this.failSession(session, probeError("stdout-end")));
    child.stdin.once("error", () => this.failSession(session, probeError("stdin-error")));
    child.once("error", () => this.failSession(session, probeError("child-error")));
    child.once("exit", () => this.failSession(session, probeError("child-exit")));
    child.once("close", () => this.failSession(session, probeError("child-close")));
    return startupPromise;
  }

  receive(session, chunk) {
    if (session !== this.session || session.failed) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    session.buffer = Buffer.concat([session.buffer, bytes]);
    if (session.buffer.length > PROCESS_PROBE_MAX_RESPONSE_BYTES) {
      this.failSession(session, probeError("output-too-large"));
      return;
    }

    let lineEnd;
    while ((lineEnd = session.buffer.indexOf(0x0a)) !== -1) {
      const lineBytes = session.buffer.subarray(0, lineEnd);
      session.buffer = session.buffer.subarray(lineEnd + 1);
      if (lineBytes.length > PROCESS_PROBE_MAX_RESPONSE_BYTES) {
        this.failSession(session, probeError("output-too-large"));
        return;
      }
      let line;
      try {
        const withoutCarriageReturn = lineBytes.at(-1) === 0x0d
          ? lineBytes.subarray(0, -1)
          : lineBytes;
        line = new TextDecoder("utf-8", { fatal: true }).decode(withoutCarriageReturn);
      } catch (_error) {
        this.failSession(session, probeError("non-utf8-output"));
        return;
      }
      this.receiveLine(session, line);
      if (session.failed) return;
    }
  }

  receiveLine(session, line) {
    if (!session.ready) {
      if (line !== READY_LINE) {
        this.failSession(session, probeError("invalid-ready"));
        return;
      }
      session.ready = true;
      this.clearTimer(session.startupTimer);
      session.startupTimer = null;
      if (this.startupPromise) this.startupPromise = null;
      session.resolveStartup();
      this.drain();
      return;
    }

    if (!this.active || this.active.session !== session) {
      this.failSession(session, probeError("unexpected-response"));
      return;
    }

    let response;
    try {
      response = validateResponse(JSON.parse(line));
    } catch (error) {
      this.failSession(session, error?.code === "AFTER_EFFECTS_PROCESS_PROBE_FAILED"
        ? error
        : probeError("malformed-response"));
      return;
    }
    if (response.requestId !== this.active.requestId) {
      this.failSession(session, probeError("wrong-request-id"));
      return;
    }
    if (response.error) {
      this.failSession(session, probeError(response.error));
      return;
    }

    const active = this.active;
    this.active = null;
    this.clearTimer(active.timer);
    active.resolve({ processCount: response.processCount, records: response.records });
    this.drain();
  }

  drain() {
    if (this.draining || this.active || this.queue.length === 0 || this.disposed) return;
    this.draining = true;
    this.ensureStarted().then(() => {
      this.draining = false;
      if (!this.disposed && this.session?.ready) this.sendNext(this.session);
    }).catch(() => {
      this.draining = false;
    });
  }

  sendNext(session) {
    if (this.active || this.queue.length === 0 || session !== this.session || !session.ready) return;
    if (!validRequestId(this.nextRequestId)) {
      this.failSession(session, probeError("request-id-exhausted"));
      return;
    }
    const request = this.queue.shift();
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    const active = {
      ...request,
      requestId,
      session,
      timer: this.setTimer(() => {
        this.failSession(session, probeError("query-timeout"));
      }, this.queryTimeoutMs)
    };
    this.active = active;
    try {
      session.child.stdin.write(`QUERY ${requestId}\n`, "utf8", (error) => {
        if (error) this.failSession(session, probeError("stdin-write-error"));
      });
    } catch (_error) {
      this.failSession(session, probeError("stdin-write-threw"));
    }
  }

  failSession(session, error) {
    if (!session || session.failed) return;
    session.failed = true;
    if (session.startupTimer) this.clearTimer(session.startupTimer);
    if (this.active?.session === session) {
      const active = this.active;
      this.active = null;
      this.clearTimer(active.timer);
      active.reject(error);
    }
    if (!session.ready && typeof session.rejectStartup === "function") session.rejectStartup(error);
    if (this.session === session) {
      this.session = null;
      this.child = null;
      this.startupPromise = null;
    }
    this.rejectPending(error);
    try { session.child?.stdin?.end(); } catch (_error) {}
    try { session.child?.kill?.(); } catch (_error) {}
  }

  rejectPending(error) {
    const pending = this.queue.splice(0);
    for (const request of pending) request.reject(error);
  }
}

module.exports = {
  ENUMERATION_FAILED,
  HELPER_SCRIPT,
  PROCESS_PROBE_MAX_RECORDS,
  PROCESS_PROBE_MAX_RESPONSE_BYTES,
  PROCESS_PROBE_QUERY_TIMEOUT_MS,
  PROCESS_PROBE_STARTUP_TIMEOUT_MS,
  READY_LINE,
  WindowsAfterEffectsProcessProbe
};
