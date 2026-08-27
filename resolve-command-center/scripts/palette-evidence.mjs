#!/usr/bin/env node
/**
 * Developer-only Palette renderer evidence utility.
 *
 * It serves a built or packaged renderer to Playwright, injects the normal
 * preload-shaped host API only inside that browser process, and writes
 * screenshots plus structural/interaction assertions. It is not an Electron,
 * Resolve, native-compositor, or pixel-baseline test. Runs are headless unless
 * a developer explicitly passes --headed.
 *
 * Examples:
 *   npm run palette:evidence
 *   node scripts/palette-evidence.mjs --renderer packaged --output ..\\.trellis\\tasks\\08-26-selected-command-actions-palette\\evidence\\playwright
 *   node scripts/palette-evidence.mjs --renderer built --scenario actions-attached,actions-hover-selected
 */
import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { version: playwrightVersion } = require("playwright/package.json");
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const EDGE_EXECUTABLE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const MAIN_VIEWPORT = { width: 240, height: 320 };
const ATTACHED_VIEWPORT = { width: 422, height: 320 };
const ATTACHED_PANEL = { inset: 8, minHeight: 65, maxHeight: 304 };
const PALETTE_SURFACE = "rgb(21, 22, 25)";
const SCENARIOS = new Set([
  "default",
  "pinned-recent",
  "search-results",
  "command-baseline",
  "actions-disabled",
  "actions-empty",
  "actions-attached",
  "actions-host-unavailable",
  "actions-filtered",
  "actions-hover-selected",
  "actions-no-results",
  "label-tooltip",
  "event-feedback",
  "error-feedback"
]);
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".png", "image/png"],
  [".json", "application/json; charset=utf-8"]
]);

function usage(message = "") {
  if (message) console.error(`Error: ${message}\n`);
  console.error("Usage: npm run palette:evidence -- [--renderer built|packaged] [--output <directory>] [--scenario <name[,name...]>] [--browser <executable>] [--headed]");
  process.exitCode = 2;
}

function parseArgs(args) {
  const options = {
    renderer: "packaged",
    output: path.join(os.tmpdir(), "clackly-palette-evidence"),
    scenarios: new Set(SCENARIOS),
    headed: false,
    browser: process.env.CLACKLY_PLAYWRIGHT_BROWSER || EDGE_EXECUTABLE
  };

  const normalizedArgs = args.flatMap((argument) => {
    const equals = argument.startsWith("--") ? argument.indexOf("=") : -1;
    return equals > 2 ? [argument.slice(0, equals), argument.slice(equals + 1)] : [argument];
  });

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const argument = normalizedArgs[index];
    if (argument === "--headed") {
      options.headed = true;
    } else if (["--renderer", "--output", "--scenario", "--browser"].includes(argument)) {
      const value = normalizedArgs[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--renderer") {
        if (!["built", "packaged"].includes(value)) throw new Error("--renderer must be built or packaged");
        options.renderer = value;
      } else if (argument === "--output") {
        options.output = path.resolve(value);
      } else if (argument === "--browser") {
        options.browser = path.resolve(value);
      } else {
        const names = value === "all" ? [...SCENARIOS] : value.split(",").filter(Boolean);
        if (!names.length || names.some((name) => !SCENARIOS.has(name))) {
          throw new Error(`--scenario accepts all or: ${[...SCENARIOS].join(", ")}`);
        }
        options.scenarios = new Set(names);
      }
    } else if (argument === "--help" || argument === "-h") {
      usage();
      return null;
    } else {
      throw new Error(`Unknown argument ${argument}`);
    }
  }
  return options;
}

function expect(value, message) {
  assert.ok(value, message);
}

function readyStatus(id) {
  return { id, installed: true, enabled: true, status: "ready", message: null, details: { missing: [], action: null } };
}

function rgba(value) {
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) {
    const hex = value.slice(1);
    return {
      red: Number.parseInt(hex.slice(0, 2), 16),
      green: Number.parseInt(hex.slice(2, 4), 16),
      blue: Number.parseInt(hex.slice(4, 6), 16),
      alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
    };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw new Error(`Unsupported CSS color: ${value}`);
  const [red, green, blue, alpha = "1"] = match[1].split(",").map((part) => part.trim());
  return { red: Number(red), green: Number(green), blue: Number(blue), alpha: Number(alpha) };
}

function composite(foreground, background) {
  const source = rgba(foreground);
  const behind = rgba(background);
  const alpha = source.alpha + behind.alpha * (1 - source.alpha);
  return {
    red: (source.red * source.alpha + behind.red * behind.alpha * (1 - source.alpha)) / alpha,
    green: (source.green * source.alpha + behind.green * behind.alpha * (1 - source.alpha)) / alpha,
    blue: (source.blue * source.alpha + behind.blue * behind.alpha * (1 - source.alpha)) / alpha,
    alpha
  };
}

function luminance(color) {
  const linear = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function rendererPaths(renderer) {
  if (renderer === "built") {
    return {
      rendererRoot: path.join(PACKAGE_ROOT, "dist", "renderer"),
      commandRoot: path.join(PACKAGE_ROOT, "command-engine", "commands")
    };
  }
  const packagedApp = path.join(PACKAGE_ROOT, "release", "win-unpacked", "resources", "app");
  return {
    rendererRoot: path.join(packagedApp, "dist", "renderer"),
    commandRoot: path.join(packagedApp, "command-engine", "commands")
  };
}

async function loadVisibleCommands(commandRoot) {
  const files = (await readdir(commandRoot)).filter((file) => file.endsWith(".json")).sort();
  const commands = (await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(commandRoot, file), "utf8"))))).flat();
  const visible = commands.filter((command) => command.presentation !== "internal");
  expect(visible.length >= 3, "The renderer authority must provide at least three visible registered commands.");
  return visible;
}

function createBindings(commands) {
  return commands.map((command) => ({
    id: `${command.id}.left-click`,
    target: command.id,
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: command.id }
  }));
}

function developerTestActions(commandId) {
  return {
    commandId,
    rows: [
      { label: "Preview · Context", description: "Browser-only developer/test row for the current command context" },
      { label: "Preview · Boundary", description: "Browser-only developer/test row; no product Action contract or execution" },
      { label: "Preview · Truncation validation", description: "Browser-only developer/test row with long compact secondary text at 240×320" }
    ]
  };
}

async function startStaticServer(rendererRoot) {
  const root = path.resolve(rendererRoot);
  await stat(path.join(root, "index.html"));
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      if (pathname === "/favicon.ico") return response.writeHead(204).end();
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = path.resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end("Forbidden");
      const content = await readFile(target);
      response.writeHead(200, { "Content-Type": MIME_TYPES.get(path.extname(target)) || "application/octet-stream" });
      response.end(content);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}

async function createScenario(browser, serverUrl, host) {
  const context = await browser.newContext({ viewport: MAIN_VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript((seed) => {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const state = { executedCommands: [], interactions: [], hideCount: 0, settingsCount: 0, attachedActionsMetrics: [], attachedActionsCloseCount: 0, onShown: null };
    const emitShown = () => requestAnimationFrame(() => state.onShown?.());
    window.__clacklyPaletteEvidence = state;
    // Explicitly developer/test-only renderer presentation input; never host API data.
    window.__CLACKLY_DEVELOPER_TEST_ACTIONS_PRESENTATION__ = clone(seed.actionPresentation);
    window.resolveCommandCenter = {
      listCommands: async () => clone(seed.commands),
      listInteractionBindings: async () => clone(seed.bindings),
      executeCommand: async (commandId) => {
        if (seed.commandFailure) throw new Error(seed.commandFailure);
        return new Promise((resolve) => requestAnimationFrame(() => {
          state.executedCommands.push(commandId);
          resolve({ commandId });
        }));
      },
      executeInteraction: async (interaction) => {
        state.interactions.push(clone(interaction));
        return { matched: false };
      },
      listFeatures: async () => [],
      listFeatureStatuses: async () => clone(seed.statuses),
      refreshFeatureStatuses: async () => clone(seed.statuses),
      setFeatureEnabled: async (featureId, enabled) => ({ id: featureId, installed: true, enabled, status: "ready", message: null, details: { missing: [], action: null } }),
      getConfig: async () => ({}),
      saveConfig: async (_capabilityId, values) => clone(values),
      resetConfig: async () => ({}),
      pickPath: async () => null,
      openSettings: () => { state.settingsCount += 1; },
      closeSettings: () => {},
      hidePalette: () => { state.hideCount += 1; },
      openAttachedActions: async (metrics) => {
        state.attachedActionsMetrics.push(clone(metrics));
        if (seed.attachedPanelFailure === "reject") throw new Error("Attached Actions host unavailable");
        if (seed.attachedPanelFailure === "null") return null;
        const panelTop = Math.min(
          Math.max(Math.round(metrics.anchorY - metrics.contentHeight / 2), seed.attachedPanel.inset),
          320 - seed.attachedPanel.inset - metrics.contentHeight
        );
        return { panelTop, panelHeight: metrics.contentHeight, anchorY: metrics.anchorY };
      },
      closeAttachedActions: () => { state.attachedActionsCloseCount += 1; },
      onPaletteShown: (callback) => {
        state.onShown = callback;
        emitShown();
        return () => { if (state.onShown === callback) state.onShown = null; };
      },
      onSettingsFeatureSelected: () => () => {}
    };
  }, host);

  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(serverUrl, { waitUntil: "networkidle" });
  if (host.commands.length) await page.locator(".launcher-view .command-row").first().waitFor();
  else await page.locator(".launcher-view .empty-state").waitFor();
  await page.waitForTimeout(80);
  return { context, page, problems };
}

async function inspectLayout(page, label) {
  const viewport = page.viewportSize();
  const layout = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const shell = document.querySelector(".palette-shell");
    const main = document.querySelector(".palette-main");
    const panel = document.querySelector(".actions-panel");
    const footer = document.querySelector(".palette-footer");
    const candidates = [...document.querySelectorAll(".launcher-search, .search-control, .command-row, .action-row, .actions-list, .palette-event-feedback")]
      .filter((element) => getComputedStyle(element).display !== "none")
      .map(rect);
    return {
      documentWidth: document.documentElement.clientWidth,
      documentHeight: document.documentElement.clientHeight,
      bodyWidth: document.body.clientWidth,
      bodyHeight: document.body.clientHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      shell: rect(shell),
      main: rect(main),
      panel: panel ? rect(panel) : null,
      footer: rect(footer),
      candidates
    };
  });
  assert.equal(layout.documentWidth, viewport.width, `${label}: document width`);
  assert.equal(layout.documentHeight, viewport.height, `${label}: document height`);
  assert.equal(layout.bodyWidth, viewport.width, `${label}: body width`);
  assert.equal(layout.bodyHeight, viewport.height, `${label}: body height`);
  assert.ok(layout.documentScrollWidth <= viewport.width, `${label}: document has no horizontal overflow`);
  assert.ok(layout.bodyScrollWidth <= viewport.width, `${label}: body has no horizontal overflow`);
  assert.equal(Math.round(layout.shell.width), viewport.width, `${label}: shell width`);
  assert.equal(Math.round(layout.shell.height), viewport.height, `${label}: shell height`);
  assert.equal(Math.round(layout.main.width), MAIN_VIEWPORT.width, `${label}: main remains fixed at 240px`);
  assert.equal(Math.round(layout.main.height), MAIN_VIEWPORT.height, `${label}: main remains fixed at 320px`);
  assert.ok(layout.footer.top >= 0 && layout.footer.bottom <= MAIN_VIEWPORT.height, `${label}: footer remains inside the main surface`);
  if (layout.panel) {
    assert.deepEqual(viewport, ATTACHED_VIEWPORT, `${label}: attached panel uses the 422×320 envelope`);
    assert.equal(Math.round(layout.panel.left), 246, `${label}: panel stays right of the main surface`);
    assert.equal(Math.round(layout.panel.width), 176, `${label}: panel keeps the content-fit width`);
    assert.ok(layout.panel.height >= 65 && layout.panel.height <= 304, `${label}: panel height is content-fit and bounded`);
  }
  for (const candidate of layout.candidates) {
    assert.ok(candidate.left >= -0.5 && candidate.right <= viewport.width + 0.5, `${label}: content remains horizontally inside the viewport`);
  }
  return layout;
}

async function inspectSurfaceHierarchy(page, label) {
  const surfaces = await page.evaluate(() => {
    const color = (selector, property = "backgroundColor") => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element)[property] : null;
    };
    return {
      main: color(".palette-main"),
      content: color(".launcher-view, .search-view"),
      footer: color(".palette-footer-area"),
      search: color(".launcher-search, .search-control"),
      panel: color(".actions-panel"),
      arrow: color(".actions-panel-arrow"),
      footerText: color(".footer-control", "color"),
      sectionText: color(".command-section h2, .list-heading", "color"),
      metadataText: color(".command-row:not(.selected) .command-detail, .action-row:not(.selected) .action-description", "color"),
      commandText: getComputedStyle(document.documentElement).getPropertyValue("--color-text-secondary").trim()
    };
  });
  const surface = rgba(surfaces.content);

  assert.equal(surfaces.content, PALETTE_SURFACE, `${label}: Palette surface matches the approved #151619 authority`);
  assert.equal(surfaces.main, surfaces.content, `${label}: main background continues the Palette content field`);
  assert.equal(surfaces.footer, surfaces.content, `${label}: footer remains in the Palette surface family, not a dark toolbar`);
  if (surfaces.panel) {
    assert.equal(surfaces.panel, surfaces.content, `${label}: attached Actions uses the shared Palette surface`);
    assert.equal(surfaces.arrow, surfaces.panel, `${label}: attached Actions arrow matches its panel surface`);
  }

  const search = composite(surfaces.search, surfaces.content);
  assert.ok(luminance(search) < luminance(surface), `${label}: search remains a subtly inset control within the Palette surface`);

  const readableMuted = [
    ["footer", surfaces.footerText],
    ["section", surfaces.sectionText],
    ["metadata", surfaces.metadataText]
  ].map(([name, color]) => ({ name, ratio: contrastRatio(composite(color, surfaces.content), surface) }));
  for (const { name, ratio } of readableMuted) {
    assert.ok(ratio >= 4.5, `${label}: ${name} muted text remains WCAG-readable (${ratio.toFixed(2)}:1)`);
  }
  const commandContrast = contrastRatio(composite(surfaces.commandText, surfaces.content), surface);
  assert.ok(commandContrast > readableMuted[0].ratio, `${label}: command text token remains stronger than Footer text`);

  return { ...surfaces, searchLuminance: luminance(search), mutedContrast: readableMuted };
}

async function assertRowsSingleLine(page, selector, label) {
  const rows = await page.locator(selector).evaluateAll((elements) => elements.map((row) => {
    const text = row.querySelector(".command-name, .action-label");
    const rect = row.getBoundingClientRect();
    const style = getComputedStyle(text);
    return { height: rect.height, textHeight: text.getBoundingClientRect().height, scrollHeight: text.scrollHeight, whiteSpace: style.whiteSpace, textOverflow: style.textOverflow };
  }));
  expect(rows.length > 0, `${label}: renders compact rows`);
  for (const row of rows) {
    assert.equal(Math.round(row.height), 30, `${label}: row has compact 30px rhythm`);
    assert.equal(row.whiteSpace, "nowrap", `${label}: primary text is single-line`);
    assert.equal(row.textOverflow, "ellipsis", `${label}: primary text truncates rather than wraps`);
    assert.ok(row.scrollHeight <= Math.ceil(row.textHeight) + 1, `${label}: primary text did not gain a second line`);
  }
}

async function screenshot(page, output, name) {
  const viewport = page.viewportSize();
  const target = path.join(output, name);
  const buffer = await page.screenshot({ path: target, scale: "css", animations: "disabled", omitBackground: true });
  assert.equal(buffer.readUInt32BE(16), viewport.width, `${name}: PNG width`);
  assert.equal(buffer.readUInt32BE(20), viewport.height, `${name}: PNG height`);
  return target;
}

async function readState(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__clacklyPaletteEvidence)));
}

async function focusShell(page) {
  await page.locator(".palette-shell").focus();
}

async function openActions(page) {
  await focusShell(page);
  await page.setViewportSize(ATTACHED_VIEWPORT);
  await page.keyboard.press("Control+k");
  await page.locator(".actions-panel").waitFor();
  await page.locator(".actions-search-control input").waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Search selected-command actions");
}

async function closeScenario(scenario, label) {
  assert.deepEqual(scenario.problems, [], `${label}: no unexpected console or page errors`);
  await scenario.context.close();
}

async function runScenario(name, context) {
  const { browser, serverUrl, host, output, evidence, checks } = context;
  const scenario = await createScenario(browser, serverUrl, host);
  const { page } = scenario;
  try {
    if (name === "default") {
      await inspectLayout(page, name);
      const surfaces = await inspectSurfaceHierarchy(page, name);
      await assertRowsSingleLine(page, ".command-row", name);
      assert.equal(await page.locator(".all-actions-view, .alphabet-rail, [aria-label='All actions']").count(), 0, "Default removes the All Actions browser and A–Z rail");
      const footer = await page.locator(".palette-footer").evaluate((element) => ({
        keycaps: [...element.querySelectorAll(".footer-actions-keycaps kbd")].map((keycap) => keycap.textContent),
        buttons: [...element.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"))
      }));
      assert.deepEqual(footer.keycaps, ["Ctrl", "K"], "Footer exposes separate Ctrl and K keycaps");
      assert.equal(footer.buttons[0], "Settings", "Settings remains the leftmost footer affordance");
      expect(footer.buttons[1].startsWith("Pin "), "Pin follows Settings in the footer");
      evidence.push(await screenshot(page, output, "default.png"));
      checks.push(`default command shell: 240×320, no All Actions/A–Z, Settings→Pin footer, separate Ctrl/K Actions keycaps, compact command rows, unified ${surfaces.content} main/Footer surface with inset Search and ${surfaces.mutedContrast[0].ratio.toFixed(2)}:1 readable Footer text`);
    } else if (name === "pinned-recent") {
      await page.getByRole("button", { name: /pin export to after effects/i }).click();
      await focusShell(page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.getByRole("heading", { name: "PINNED" }).waitFor();
      await page.getByRole("heading", { name: "RECENT" }).waitFor();
      const sections = await page.locator(".command-section").evaluateAll((elements) => elements.map((section) => ({
        label: section.querySelector("h2").textContent,
        commands: [...section.querySelectorAll(".command-name")].map((node) => node.textContent)
      })));
      assert.equal(new Set(sections.flatMap((section) => section.commands)).size, sections.flatMap((section) => section.commands).length, "Pinned/Recent projection has no duplicate commands");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "pinned-recent.png"));
      checks.push("real UI Pin plus Command execution projects nonempty Pinned and Recent sections without duplicates");
    } else if (name === "search-results") {
      await page.locator(".launcher-search").click();
      await page.locator(".search-control input").fill("a");
      assert.ok(await page.locator(".search-view .command-row").count() > 1, "Search keeps multiple real command results");
      assert.equal(await page.locator(".launcher-view").count(), 0, "Search mode removes launcher sections from the DOM");
      assert.equal(await page.getByRole("button", { name: "Back to launcher" }).count(), 0, "Search footer has no duplicate Back control");
      assert.equal(await page.locator(".search-control kbd").textContent(), "ESC", "Search keeps the in-field Escape hint");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      await assertRowsSingleLine(page, ".command-row", name);
      evidence.push(await screenshot(page, output, "search-results.png"));
      await page.keyboard.press("Escape");
      await page.locator(".launcher-view").waitFor();
      assert.equal(await page.locator(".search-view").count(), 0, "Search Escape returns to Launcher without hiding the Palette");
      checks.push("Search remains a separate multi-result Command DOM mode with no Launcher sections, has no footer Back control, retains its ESC hint, and Escape returns to Launcher");
    } else if (name === "command-baseline") {
      await focusShell(page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => window.__clacklyPaletteEvidence.executedCommands.length === 1);
      const state = await readState(page);
      assert.equal(state.executedCommands.length, 1, "Command Enter retains existing command execution routing");
      checks.push("baseline command Arrow/Enter remains routed through the injected command API");
    } else if (name === "actions-disabled") {
      const noCommandHost = { ...host, commands: [], bindings: [], statuses: [], actionPresentation: null };
      await scenario.context.close();
      const disabledScenario = await createScenario(browser, serverUrl, noCommandHost);
      const actionsToggle = disabledScenario.page.getByRole("button", { name: "Open selected command actions" });
      assert.equal(await actionsToggle.isDisabled(), true, "Actions footer control is disabled without a selected command");
      await closeScenario(disabledScenario, name);
      checks.push("Actions footer is disabled when the renderer has no valid selected Command");
      return;
    } else if (name === "actions-empty") {
      const emptyHost = { ...host, actionPresentation: null };
      await scenario.context.close();
      const emptyScenario = await createScenario(browser, serverUrl, emptyHost);
      await openActions(emptyScenario.page);
      await emptyScenario.page.getByText("No contextual actions").waitFor();
      assert.equal(await emptyScenario.page.locator(".action-row").count(), 0, "Production-shaped empty Actions shell has no injected rows");
      await closeScenario(emptyScenario, name);
      checks.push("empty Actions shell stays truthful without developer/test presentation data");
      return;
    } else if (name === "actions-attached") {
      const preservedName = await page.locator(".launcher-view .command-row.selected .command-name").textContent();
      await openActions(page);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Search selected-command actions", "Actions search receives focus immediately");
      assert.equal(await page.locator(".action-row").count(), host.actionPresentation.rows.length, "Developer/test presentation rows are the sole populated Actions input");
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.locator(".palette-main .command-row.selected .command-name").textContent(), preservedName, "Main keyboard selection remains visibly frozen under Actions");
      assert.equal(await page.locator(".actions-panel .action-row.selected .action-label").textContent(), host.actionPresentation.rows[1].label, "Actions keeps an independent selected row");
      assert.equal(await page.locator(".palette-main").isVisible(), true, "Main Palette remains visible beside attached Actions");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      await assertRowsSingleLine(page, ".action-row", name);
      evidence.push(await screenshot(page, output, "actions-attached.png"));
      await page.keyboard.press("Control+k");
      await page.locator(".actions-panel").waitFor({ state: "detached" });
      assert.equal(await page.locator(".launcher-view .command-row.selected .command-name").textContent(), preservedName, "Ctrl+K close preserves command selection");
      await openActions(page);
      await page.keyboard.press("Escape");
      await page.locator(".actions-panel").waitFor({ state: "detached" });
      assert.equal(await page.locator(".launcher-view .command-row.selected .command-name").textContent(), preservedName, "Escape return preserves command selection");
      const state = await readState(page);
      assert.ok(state.attachedActionsMetrics.every(({ anchorY, contentHeight }) => Number.isInteger(anchorY) && Number.isInteger(contentHeight)), "Renderer sends only bounded semantic attached-panel measurements");
      checks.push("Ctrl+K attaches a first-level panel with the same neutral Palette surface as the visible main/Footer, keeps main selection visible, and Ctrl+K/Escape restore the preserved Command context");
    } else if (name === "actions-host-unavailable") {
      await scenario.context.close();
      for (const attachedPanelFailure of ["null", "reject"]) {
        const unavailableScenario = await createScenario(browser, serverUrl, { ...host, attachedPanelFailure });
        const unavailablePage = unavailableScenario.page;
        await focusShell(unavailablePage);
        await unavailablePage.keyboard.press("Control+k");
        await unavailablePage.getByText("Actions panel is unavailable.").waitFor();
        await unavailablePage.locator(".actions-panel").waitFor({ state: "detached" });
        await unavailablePage.waitForFunction(() => document.activeElement?.classList.contains("palette-shell"));
        assert.equal(await unavailablePage.locator(".palette-main").isVisible(), true, `Attached Actions ${attachedPanelFailure} keeps the main Palette visible`);
        await inspectLayout(unavailablePage, `actions-host-unavailable-${attachedPanelFailure}`);
        const state = await readState(unavailablePage);
        assert.ok(state.attachedActionsMetrics.length > 0, `Attached Actions ${attachedPanelFailure} attempted only semantic host metrics`);
        assert.ok(state.attachedActionsCloseCount > 0, `Attached Actions ${attachedPanelFailure} closes the host presentation safely`);
        if (attachedPanelFailure === "null") {
          evidence.push(await screenshot(unavailablePage, output, "actions-host-unavailable.png"));
        }
        await closeScenario(unavailableScenario, `actions-host-unavailable-${attachedPanelFailure}`);
      }
      checks.push("Null and rejected Attached Actions host intent close the panel, preserve/focus the main Palette, show concise persistent error feedback, and produce no console/page error");
      return;
    } else if (name === "actions-filtered") {
      await openActions(page);
      await page.locator(".actions-search-control input").fill("boundary");
      assert.equal(await page.locator(".action-row").count(), 1, "Action query filters isolated developer/test rows case-insensitively");
      assert.match(await page.locator(".action-row").first().innerText(), /preview · boundary/i, "Filtered Actions row is truthful test-only presentation content");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "actions-filtered.png"));
      checks.push("Actions query filters only injected developer/test presentation rows");
    } else if (name === "actions-hover-selected") {
      await openActions(page);
      await page.keyboard.press("ArrowDown");
      const rows = page.locator(".action-row");
      await rows.nth(0).hover();
      await page.waitForTimeout(140);
      const rowState = await rows.evaluateAll((elements) => elements.map((row) => ({
        label: row.querySelector(".action-label").textContent,
        selected: row.classList.contains("selected"),
        hovered: row.classList.contains("hovered"),
        background: getComputedStyle(row).backgroundColor
      })));
      const selected = rowState.find((row) => row.selected);
      const hovered = rowState.find((row) => row.hovered);
      const defaultRow = rowState.find((row) => !row.selected && !row.hovered);
      assert.notEqual(selected.label, hovered.label, "Keyboard selection remains independent from pointer hover");
      const surface = await page.locator(".actions-panel").evaluate((element) => getComputedStyle(element).backgroundColor);
      const tones = {
        default: luminance(composite(defaultRow.background, surface)),
        hover: luminance(composite(hovered.background, surface)),
        selected: luminance(composite(selected.background, surface))
      };
      assert.ok(tones.selected > tones.hover && tones.hover > tones.default, `Actions selected > hover > default hierarchy: ${JSON.stringify(tones)}`);
      await page.keyboard.press("Enter");
      await page.locator(".palette-event-feedback").waitFor();
      const state = await readState(page);
      assert.deepEqual(state.executedCommands, [], "Actions Enter sends zero command IPC calls");
      assert.deepEqual(state.interactions, [], "Actions Enter sends zero interaction IPC calls");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      await assertRowsSingleLine(page, ".action-row", name);
      evidence.push(await screenshot(page, output, "actions-hover-selected.png"));
      checks.push(`Actions Arrow selection, separate pointer hover, local Enter acknowledgement, and zero execution/interaction IPC; tones ${JSON.stringify(tones)}`);
    } else if (name === "actions-no-results") {
      await openActions(page);
      await page.locator(".actions-search-control input").fill("does-not-exist");
      await page.getByText("No matching actions").waitFor();
      assert.equal(await page.locator(".action-row").count(), 0, "No-result action query renders no rows");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "actions-no-results.png"));
      checks.push("Actions no-result state is truthful and remains inside the fixed viewport");
    } else if (name === "label-tooltip") {
      await openActions(page);
      const rows = page.locator(".action-row");
      assert.equal(await page.locator(".palette-tooltip").count(), 0, "No custom tooltip is persistent before real overflow interaction");
      const longLabel = rows.nth(2).locator(".action-label");
      assert.equal(await longLabel.evaluate((element) => element.scrollWidth > element.clientWidth), true, "Long Action label genuinely overflows");
      await rows.nth(2).hover();
      await page.waitForTimeout(500);
      const tooltip = page.locator(".palette-tooltip");
      await tooltip.waitFor();
      const tooltipRect = await tooltip.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      assert.ok(tooltipRect.width >= 180 && tooltipRect.width <= 210, "Overflow tooltip keeps a bounded readable width");
      assert.ok(tooltipRect.height <= 54 && tooltipRect.left >= 0 && tooltipRect.right <= ATTACHED_VIEWPORT.width && tooltipRect.top >= 0 && tooltipRect.bottom <= ATTACHED_VIEWPORT.height, "Overflow tooltip remains clamped inside the current BrowserWindow");
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "label-tooltip.png"));
      checks.push("Custom tooltip appears only after 450ms real label overflow, stays clamped, and native title remains fallback only");
    } else if (name === "event-feedback") {
      await openActions(page);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      const feedback = page.locator(".palette-event-feedback");
      await feedback.waitFor();
      assert.match(await feedback.textContent(), /^Selected Preview · Boundary$/, "Action acknowledgement uses concise visible copy");
      assert.match(await feedback.getAttribute("aria-label"), /execution is not connected in this preview/i, "Action acknowledgement preserves full aria-live detail");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "event-feedback.png"));
      await page.waitForTimeout(3100);
      assert.equal(await feedback.count(), 0, "Transient acknowledgement auto-dismisses without a persistent help bar");
      checks.push("Status/acknowledgement is a compact transient event feedback surface with concise visible and full accessible text");
    } else if (name === "error-feedback") {
      const commandFailure = "Command bridge is unavailable. Open Settings to recover, then retry.";
      await scenario.context.close();
      const errorScenario = await createScenario(browser, serverUrl, { ...host, commandFailure });
      const errorPage = errorScenario.page;
      await focusShell(errorPage);
      await errorPage.keyboard.press("Enter");
      const feedback = errorPage.locator(".palette-event-feedback.error");
      await feedback.waitFor();
      assert.equal(await feedback.textContent(), commandFailure, "Error feedback retains the full source text for accessibility");
      const feedbackStyle = await feedback.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { height: rect.height, whiteSpace: style.whiteSpace, lineClamp: style.webkitLineClamp };
      });
      assert.ok(feedbackStyle.height <= 42, "Error feedback stays within the compact three-line maximum");
      assert.equal(feedbackStyle.whiteSpace, "normal", "Error feedback can wrap for readable compact recovery copy");
      assert.equal(feedbackStyle.lineClamp, "3", "Error feedback is clamped to three lines");
      await inspectLayout(errorPage, name);
      await inspectSurfaceHierarchy(errorPage, name);
      evidence.push(await screenshot(errorPage, output, "error-feedback.png"));
      await errorPage.waitForTimeout(3100);
      assert.equal(await feedback.count(), 1, "Error feedback remains visible until the existing recovery/clear path resolves it");
      await closeScenario(errorScenario, name);
      checks.push("Errors remain visible, retain full aria-live text, and use a compact readable three-line maximum rather than acknowledgement auto-dismissal");
      return;
    }
  } finally {
    await closeScenario(scenario, name);
  }
}

async function run() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
    return;
  }
  if (!options) return;

  const { rendererRoot, commandRoot } = rendererPaths(options.renderer);
  const commands = await loadVisibleCommands(commandRoot);
  const capabilities = [...new Set(commands.map((command) => command.capability))];
  const host = {
    commands,
    bindings: createBindings(commands),
    statuses: capabilities.map(readyStatus),
    actionPresentation: developerTestActions(commands[0].id),
    attachedPanel: ATTACHED_PANEL
  };
  await mkdir(options.output, { recursive: true });
  const { server, url } = await startStaticServer(rendererRoot);
  const executablePath = await access(options.browser).then(() => options.browser).catch(() => undefined);
  const browser = await chromium.launch({ headless: !options.headed, ...(executablePath ? { executablePath } : {}) });
  const evidence = [];
  const checks = [];
  try {
    for (const scenario of SCENARIOS) {
      if (options.scenarios.has(scenario)) await runScenario(scenario, { browser, serverUrl: url, host, output: options.output, evidence, checks });
    }
    const report = {
      scope: "Developer-only Playwright renderer evidence. Host stubs and developer/test Actions presentation data exist only in the browser process.",
      limitations: [
        "This proves built/packaged renderer DOM, CSS, keyboard, and pointer behavior only.",
        "It does not prove Electron setShape/DWM composition, transparent-gap hit testing, cursor placement, native focus, package installation, Resolve Workflow lifecycle, or Resolve command execution."
      ],
      playwrightVersion,
      browser: { channel: executablePath ? "explicit browser executable" : "Playwright Chromium", version: browser.version(), headless: !options.headed },
      renderer: options.renderer,
      rendererRoot,
      output: options.output,
      viewports: { main: MAIN_VIEWPORT, attached: ATTACHED_VIEWPORT, deviceScaleFactor: 1 },
      commands: commands.map(({ id, name, category, capability }) => ({ id, name, category, capability })),
      scenarios: [...options.scenarios],
      screenshots: evidence,
      assertions: checks
    };
    await writeFile(path.join(options.output, "palette-evidence-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
