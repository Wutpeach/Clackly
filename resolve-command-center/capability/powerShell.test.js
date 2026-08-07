const assert = require("node:assert/strict");
const test = require("node:test");

const { POWER_SHELL_TIMEOUT_MS, runExecFile } = require("./powerShell");

test("runExecFile applies the bounded hidden no-shell UTF-8 PowerShell contract", async () => {
  let captured;
  const stdout = await runExecFile((executable, args, options, callback) => {
    captured = { executable, args, options };
    callback(null, "ok\n");
  }, "powershell.exe", ["-NoProfile", "-Command", "Get-Date"]);

  assert.equal(stdout, "ok\n");
  assert.equal(captured.executable, "powershell.exe");
  assert.equal(captured.options.timeout, 5000);
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.windowsHide, true);
  assert.equal(captured.options.encoding, "utf8");
  assert.equal(POWER_SHELL_TIMEOUT_MS, 5000);
});

test("runExecFile passes caller options and rejects on subprocess failure", async () => {
  let capturedOptions;
  await assert.rejects(runExecFile((executable, args, options, callback) => {
    capturedOptions = options;
    callback(Object.assign(new Error("boom"), { code: 1 }), "");
  }, "powershell.exe", [], { env: { TEST: "1" } }), /boom/);

  assert.equal(capturedOptions.env.TEST, "1");
  assert.equal(capturedOptions.timeout, 5000);
});
