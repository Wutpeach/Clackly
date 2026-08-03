const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!path.isAbsolute(relative)
    && !relative.startsWith(`..${path.sep}`)
    && relative !== "..");
}

class PythonProvider {
  constructor({
    appRoot,
    pythonExecutable = "python",
    runnerPath = path.resolve(__dirname, "..", "python_runner.py"),
    spawnProcess = spawn
  } = {}) {
    if (typeof appRoot !== "string" || appRoot.trim().length === 0) {
      throw new TypeError("Python provider requires an application root");
    }
    this.appRoot = fs.realpathSync(appRoot);
    this.pythonExecutable = pythonExecutable;
    this.runnerPath = runnerPath;
    this.spawnProcess = spawnProcess;
  }

  resolveEntry(entry) {
    if (typeof entry !== "string" || entry.trim().length === 0 || path.isAbsolute(entry)) {
      throw new Error(`Python script entry must be a relative path under the application root: ${entry}`);
    }

    const candidate = path.resolve(this.appRoot, entry);
    if (!isContained(this.appRoot, candidate) || !fs.existsSync(candidate)) {
      throw new Error(`Python script entry not found under application root: ${entry}`);
    }

    const resolved = fs.realpathSync(candidate);
    if (!isContained(this.appRoot, resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error(`Python script entry escapes application root: ${entry}`);
    }
    return resolved;
  }

  execute(scriptDefinition, context = {}) {
    const entry = scriptDefinition?.entry;
    const entryPath = this.resolveEntry(entry);
    if (typeof context.commandId !== "string" || context.commandId.trim().length === 0) {
      throw new TypeError("Python provider requires a Command id");
    }
    const request = JSON.stringify({ commandId: context.commandId, config: context.config || {} });

    // ponytail: one subprocess per execution; add pooling only if measured startup cost matters.
    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      const fail = (message) => {
        if (!settled) {
          settled = true;
          reject(new Error(`Python script ${entry} ${message}`));
        }
      };

      let child;
      try {
        child = this.spawnProcess(this.pythonExecutable, [this.runnerPath, entryPath], {
          cwd: this.appRoot,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"]
        });
      } catch (error) {
        fail(`failed to start: ${error.message}`);
        return;
      }

      child.once("error", (error) => fail(`failed to start: ${error.message}`));
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.stdin.on("error", (error) => fail(`could not receive input: ${error.message}`));
      child.once("close", (code) => {
        if (settled) return;
        if (code !== 0) {
          fail(`exited with code ${code}: ${stderr.trim() || "no stderr"}`);
          return;
        }

        let envelope;
        try {
          envelope = JSON.parse(stdout);
        } catch (_error) {
          fail(`returned invalid protocol output: ${stdout.trim() || "empty stdout"}`);
          return;
        }

        if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)
          || typeof envelope.ok !== "boolean" || !Array.isArray(envelope.logs)) {
          fail("returned an invalid protocol envelope");
          return;
        }

        if (envelope.logs.some((log) => !log
          || !["debug", "info", "warning", "error"].includes(log.level)
          || typeof log.message !== "string")) {
          fail("returned an invalid log record");
          return;
        }

        try {
          for (const log of envelope.logs) {
            const writer = context.logger?.[log.level]
              || (log.level === "warning" ? context.logger?.warn : undefined)
              || context.logger?.log;
            if (typeof writer === "function") writer.call(context.logger, log.message);
          }
        } catch (error) {
          fail(`could not replay logs: ${error.message}`);
          return;
        }

        if (!envelope.ok) {
          if (!envelope.error || typeof envelope.error.type !== "string"
            || typeof envelope.error.message !== "string") {
            fail("returned an invalid error envelope");
            return;
          }
          fail(`failed: ${envelope.error.type}: ${envelope.error.message}`);
          return;
        }

        if (!Object.hasOwn(envelope, "result")) {
          fail("returned an invalid success envelope");
          return;
        }

        settled = true;
        resolve(envelope.result);
      });

      child.stdin.end(request);
    });
  }
}

module.exports = { PythonProvider };
