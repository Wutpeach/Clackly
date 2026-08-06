// Diagnostic-only H5 entrypoint: launches the bare Electron Workflow host with
// no Clackly startup or module behavior. The lead copies this file over
// workflow-plugin/main.js only inside a separately retained H5 installed
// candidate after Resolve is closed.
const path = require("node:path");
const { app } = require("electron");

// Preserve the exact Clackly userData path so profile state stays comparable.
app.setPath("userData", path.join(app.getPath("appData"), "Clackly Workflow Plugin"));
app.disableHardwareAcceleration();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // Ready: intentionally do nothing further. Keep the host alive with no
    // windows, IPC, hotkeys, network clients, timers, or fixed delays.
  });
  app.on("window-all-closed", () => {});
}