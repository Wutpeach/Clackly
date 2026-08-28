const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require("playwright");

const packageRoot = path.resolve(__dirname, "..");
const edgeExecutable = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

function installRendererApi() {
  const command = {
    id: "dev.renderer-check",
    name: "Dev renderer check",
    description: "Confirms Vite can load the shared localization resources.",
    category: "Development",
    icon: "search",
    keywords: ["dev"],
    capability: "dev.renderer-check",
    presentation: "visible"
  };
  const status = {
    id: command.capability,
    installed: true,
    enabled: true,
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  };
  window.resolveCommandCenter = {
    getLocalizationSnapshot: async () => ({ preference: "en", effectiveLocale: "en" }),
    setLocalePreference: async () => ({ preference: "en", effectiveLocale: "en" }),
    listCommands: async () => [command],
    listInteractionBindings: async () => [],
    executeCommand: async () => ({ commandId: command.id }),
    executeInteraction: async () => ({ matched: false }),
    listFeatures: async () => [],
    listFeatureStatuses: async () => [status],
    refreshFeatureStatuses: async () => [status],
    setFeatureEnabled: async () => status,
    getConfig: async () => ({}),
    saveConfig: async (_capabilityId, values) => values,
    resetConfig: async () => ({}),
    pickPath: async () => null,
    openSettings: () => {},
    closeSettings: () => {},
    hidePalette: () => {},
    openInteractionPanel: async () => null,
    closeInteractionPanel: () => {},
    onPaletteShown: () => () => {},
    onLocalizationChanged: () => () => {},
    onSettingsFeatureSelected: () => () => {}
  };
}

test("Vite dev serves a non-empty Palette without localization module errors", async () => {
  const { createServer } = await import("vite");
  const previousPort = process.env.VITE_DEV_SERVER_PORT;
  process.env.VITE_DEV_SERVER_PORT = "0";
  let vite;
  let browser;
  try {
    vite = await createServer({
      configFile: path.join(packageRoot, "vite.config.mjs"),
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: true }
    });
    await vite.listen();
    const port = vite.httpServer.address().port;
    browser = await chromium.launch({
      headless: true,
      ...(fs.existsSync(edgeExecutable) ? { executablePath: edgeExecutable } : {})
    });
    const page = await browser.newPage({ viewport: { width: 256, height: 336 } });
    const pageErrors = [];
    await page.route("**/favicon.ico", (route) => route.fulfill({ status: 204 }));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.addInitScript(installRendererApi);
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
    await page.locator(".palette-shell").waitFor();
    assert.match(await page.locator("#root").innerText(), /Dev renderer check/);
    assert.deepEqual(pageErrors, []);
  } finally {
    await browser?.close();
    await vite?.close();
    if (previousPort === undefined) delete process.env.VITE_DEV_SERVER_PORT;
    else process.env.VITE_DEV_SERVER_PORT = previousPort;
  }
});
