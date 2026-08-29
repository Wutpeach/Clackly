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
 *   node scripts/palette-evidence.mjs --renderer packaged --output ..\\.trellis\\tasks\\08-27-command-palette-interaction-hint\\evidence\\playwright
 *   node scripts/palette-evidence.mjs --renderer built --scenario interaction-panel,interaction-lifecycle
 */
import assert from "node:assert/strict";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";
import { CommandSearchService } from "../command-search/CommandSearchService.mjs";

const require = createRequire(import.meta.url);
const { version: playwrightVersion } = require("playwright/package.json");
const { shadowPadding: PALETTE_SHADOW_PADDING } = require("../electron/shared/palette-geometry.json");
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SCRIPT_DIR, "..");
const EDGE_EXECUTABLE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const MAIN_VIEWPORT = { width: 240, height: 320 };
const INTERACTION_VIEWPORT = { width: 516, height: 320 };
const PALETTE_WINDOW_VIEWPORT = {
  width: MAIN_VIEWPORT.width + PALETTE_SHADOW_PADDING * 2,
  height: MAIN_VIEWPORT.height + PALETTE_SHADOW_PADDING * 2
};
const INTERACTION_WINDOW_VIEWPORT = {
  width: INTERACTION_VIEWPORT.width + PALETTE_SHADOW_PADDING * 2,
  height: INTERACTION_VIEWPORT.height + PALETTE_SHADOW_PADDING * 2
};
const BROWSER_PREVIEW_VIEWPORT = { width: 800, height: 600 };
const BROWSER_PREVIEW_SMALL_VIEWPORT = { width: 220, height: 280 };
const SETTINGS_VIEWPORT = { width: 760, height: 560 };
const BROWSER_PREVIEW_SAFE_EDGE = 16;
const INTERACTION_PANEL = { inset: 8, minHeight: 60, maxHeight: 180 };
const PALETTE_SURFACE = "rgb(21, 22, 25)";
const INTERACTION_SURFACE = PALETTE_SURFACE;
const EVIDENCE_SEARCH_PATH = "/__clackly-evidence-search";
const EVIDENCE_SEARCH_NOW = 1_800_000_000_000;
const SCENARIOS = new Set([
  "default",
  "pinned-recent",
  "search-results",
  "command-baseline",
  "interaction-single-description",
  "interaction-panel",
  "interaction-lifecycle",
  "interaction-host-unavailable",
  "error-feedback",
  "browser-preview",
  "settings-application-empty",
  "settings-typical-ready",
  "settings-missing-config-long-path",
  "settings-zh-cn-multi-help",
  "settings-busy",
  "settings-error",
  "settings-search-match",
  "settings-search-empty",
  "settings-reduced-motion"
]);
const SETTINGS_EVIDENCE_SCENARIOS = new Set([
  "settings-application-empty",
  "settings-typical-ready",
  "settings-missing-config-long-path",
  "settings-zh-cn-multi-help",
  "settings-busy",
  "settings-error",
  "settings-search-match",
  "settings-search-empty",
  "settings-reduced-motion"
]);
const SETTINGS_FIXTURE_BY_SCENARIO = Object.freeze({
  "settings-application-empty": "application-empty",
  "settings-typical-ready": "typical-ready",
  "settings-missing-config-long-path": "missing-config-long-path",
  "settings-zh-cn-multi-help": "zh-cn-multi-help",
  "settings-busy": "busy",
  "settings-error": "error",
  "settings-search-match": "typical-ready",
  "settings-search-empty": "typical-ready",
  "settings-reduced-motion": "typical-ready"
});
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

async function loadCommands(commandRoot) {
  const files = (await readdir(commandRoot)).filter((file) => file.endsWith(".json")).sort();
  const commands = (await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(commandRoot, file), "utf8"))))).flat();
  const visible = commands.filter((command) => command.presentation !== "internal");
  expect(visible.length >= 3, "The renderer authority must provide at least three visible registered commands.");
  return commands;
}

function createBindings(commands) {
  const visible = commands.filter((command) => command.presentation !== "internal");
  const bindings = visible.map((command) => ({
    id: `${command.id}.left-click`,
    target: command.id,
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: command.id }
  }));
  const aeTarget = commands.find(({ id }) => id === "timeline.exportToAfterEffects");
  const audioAction = commands.find(({ id }) => id === "timeline.exportAudioToAfterEffects");
  const videoAction = commands.find(({ id }) => id === "timeline.exportVideoToAfterEffects");
  if (aeTarget && audioAction && videoAction) {
    bindings.push(
      {
        id: `${aeTarget.id}.ctrl-left-click`,
        target: aeTarget.id,
        trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
        action: { command: audioAction.id }
      },
      {
        id: `${aeTarget.id}.ctrl-shift-left-click`,
        target: aeTarget.id,
        trigger: { type: "mouse", button: "left", modifiers: ["CTRL", "SHIFT"] },
        action: { command: videoAction.id }
      }
    );
  }
  return bindings;
}

async function startStaticServer(rendererRoot) {
  const root = path.resolve(rendererRoot);
  await stat(path.join(root, "index.html"));
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      if (request.method === "POST" && pathname === EVIDENCE_SEARCH_PATH) {
        const payload = await readEvidenceSearchPayload(request);
        const result = createEvidenceSearchResult(payload);
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(result));
        return;
      }
      if (pathname === "/favicon.ico") return response.writeHead(204).end();
      if (request.method !== "GET" && request.method !== "HEAD") return response.writeHead(405).end("Method not allowed");
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

async function readEvidenceSearchPayload(request) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > 1024 * 1024) throw new Error("Evidence Search request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createEvidenceSearchResult(payload) {
  const usedCommandIds = Array.isArray(payload?.usedCommandIds) ? payload.usedCommandIds : [];
  const usage = Object.fromEntries(usedCommandIds
    .filter((commandId) => typeof commandId === "string" && commandId.trim().length > 0)
    .map((commandId) => [commandId, { usageCount: 1, lastUsedAt: EVIDENCE_SEARCH_NOW }]));
  const commandSearch = new CommandSearchService({
    getCommands: () => Array.isArray(payload?.commands) ? payload.commands : [],
    localizationService: { getSnapshot: () => ({ effectiveLocale: "en" }) },
    usageHistory: { getSnapshot: () => usage },
    now: () => EVIDENCE_SEARCH_NOW
  });
  return commandSearch.search(payload?.query, payload?.pinnedIds);
}

async function createScenario(browser, serverUrl, host) {
  const context = await browser.newContext({ viewport: PALETTE_WINDOW_VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript((seed) => {
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const state = { executedCommands: [], usedCommandIds: [], searchRequests: [], interactions: [], hideCount: 0, settingsCount: 0, interactionPanelMetrics: [], interactionPanelCloseCount: 0, onShown: null };
    const emitShown = () => requestAnimationFrame(() => state.onShown?.());
    window.__clacklyPaletteEvidence = state;
    window.resolveCommandCenter = {
      listCommands: async () => clone(seed.commands),
      searchCommands: async (query, pinnedIds) => {
        const request = {
          commands: clone(seed.commands),
          query,
          pinnedIds: Array.isArray(pinnedIds) ? clone(pinnedIds) : pinnedIds,
          usedCommandIds: clone(state.usedCommandIds)
        };
        state.searchRequests.push(clone({ query, pinnedIds: request.pinnedIds }));
        const response = await fetch("/__clackly-evidence-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        });
        if (!response.ok) throw new Error(`Evidence Search failed (${response.status})`);
        return response.json();
      },
      listInteractionBindings: async () => clone(seed.bindings),
      executeCommand: async (commandId) => {
        if (seed.commandFailure) throw new Error(seed.commandFailure);
        return new Promise((resolve) => requestAnimationFrame(() => {
          state.executedCommands.push(commandId);
          if (!state.usedCommandIds.includes(commandId)) state.usedCommandIds.push(commandId);
          resolve({ commandId });
        }));
      },
      executeInteraction: async (interaction) => {
        state.interactions.push(clone(interaction));
        if (seed.interactionFailure) throw new Error(seed.interactionFailure);
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
      openInteractionPanel: async (metrics) => {
        state.interactionPanelMetrics.push(clone(metrics));
        if (seed.interactionPanelFailure === "reject") throw new Error("Interaction Panel host unavailable");
        if (seed.interactionPanelFailure === "null") return null;
        const panelTop = Math.min(
          Math.max(Math.round(metrics.anchorY - metrics.contentHeight / 2), seed.interactionPanel.inset),
          320 - seed.interactionPanel.inset - metrics.contentHeight
        );
        return { panelTop, panelHeight: metrics.contentHeight, anchorY: metrics.anchorY };
      },
      closeInteractionPanel: () => { state.interactionPanelCloseCount += 1; },
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

async function createBrowserPreviewScenario(browser, serverUrl) {
  const context = await browser.newContext({ viewport: BROWSER_PREVIEW_VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(serverUrl, { waitUntil: "networkidle" });
  await page.locator(".launcher-view .command-row").first().waitFor();
  await page.locator(".clackly-browser-preview-agentation").waitFor();
  await page.waitForTimeout(80);
  return { context, page, problems };
}

async function createSettingsPreviewScenario(browser, serverUrl, fixture, { reducedMotion = false } = {}) {
  const context = await browser.newContext({
    viewport: SETTINGS_VIEWPORT,
    deviceScaleFactor: 1,
    ...(reducedMotion ? { reducedMotion: "reduce" } : {})
  });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  const url = new URL(serverUrl);
  url.searchParams.set("view", "settings");
  url.searchParams.set("settings-preview", fixture);
  await page.goto(url.toString(), { waitUntil: "networkidle" });
  await page.locator(".settings-shell").waitFor();
  await page.locator(".settings-titlebar").waitFor();
  await page.waitForTimeout(80);
  return { context, page, problems };
}

async function inspectSettingsLayout(page, label) {
  const viewport = page.viewportSize();
  const layout = await page.evaluate(() => {
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height } : null;
    };
    const shell = document.querySelector(".settings-shell");
    const sidebar = document.querySelector(".feature-sidebar");
    const configuration = document.querySelector(".settings-configuration");
    const inspector = document.querySelector(".settings-inspector");
    const footer = document.querySelector(".settings-actions");
    const titlebar = document.querySelector(".settings-titlebar");
    const detailIcon = document.querySelector(".settings-configuration-icon");
    const selectedButton = document.querySelector(".feature-button.selected");
    const selectedIcon = selectedButton?.querySelector("svg");
    const selectedStyle = selectedButton ? getComputedStyle(selectedButton) : null;
    const effectiveStatus = document.querySelector(".feature-effective-status");
    const readyDot = document.querySelector(".feature-ready-dot");
    const search = document.querySelector(".feature-search");
    const inspectorActions = [...document.querySelectorAll(".inspector-actions .secondary-button")].map((element) => {
      const style = getComputedStyle(element);
      return { height: style.height, borderWidth: style.borderWidth, borderColor: style.borderColor, background: style.backgroundColor, icons: element.querySelectorAll("svg").length };
    });
    const control = document.querySelector(".settings-field input:not([type=checkbox]), .settings-field select");
    const candidates = [...document.querySelectorAll(".feature-button, .feature-search, .settings-configuration-header, .settings-field, .inspector-interaction-row, .settings-actions button, .inspector-actions button")]
      .filter((element) => getComputedStyle(element).display !== "none")
      .map(rect);
    return {
      documentWidth: document.documentElement.clientWidth,
      documentHeight: document.documentElement.clientHeight,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      shell: rect(shell),
      sidebar: rect(sidebar),
      configuration: rect(configuration),
      inspector: rect(inspector),
      footer: rect(footer),
      titlebar: titlebar ? { rect: rect(titlebar), background: getComputedStyle(titlebar).backgroundColor, borderBottom: getComputedStyle(titlebar).borderBottomWidth } : null,
      detailIcon: detailIcon ? { rect: rect(detailIcon), background: getComputedStyle(detailIcon).backgroundColor, border: getComputedStyle(detailIcon).borderWidth } : null,
      selected: selectedStyle ? { background: selectedStyle.backgroundColor, text: selectedStyle.color, icon: selectedIcon ? getComputedStyle(selectedIcon).color : null, height: selectedStyle.height } : null,
      effectiveStatus: effectiveStatus ? { text: effectiveStatus.textContent.trim(), color: getComputedStyle(effectiveStatus).color } : null,
      readyDot: readyDot ? getComputedStyle(readyDot).backgroundColor : null,
      search: search ? { height: getComputedStyle(search).height, borderRadius: getComputedStyle(search).borderRadius } : null,
      inspectorActions,
      control: control ? { height: getComputedStyle(control).height, background: getComputedStyle(control).backgroundColor, borderRadius: getComputedStyle(control).borderRadius } : null,
      footerShadow: footer ? getComputedStyle(footer).boxShadow : null,
      title: getComputedStyle(document.querySelector(".settings-configuration h1")).fontSize,
      section: getComputedStyle(document.querySelector(".settings-section > h2")).fontSize,
      navLabel: getComputedStyle(document.querySelector(".feature-button")).fontSize,
      candidates
    };
  });
  assert.deepEqual(viewport, SETTINGS_VIEWPORT, `${label}: renderer evidence uses the shipped 760×560 Settings viewport`);
  assert.equal(layout.documentWidth, SETTINGS_VIEWPORT.width, `${label}: Settings document width stays fixed`);
  assert.equal(layout.documentHeight, SETTINGS_VIEWPORT.height, `${label}: Settings document height stays fixed`);
  assert.ok(layout.documentScrollWidth <= SETTINGS_VIEWPORT.width, `${label}: Settings document has no horizontal overflow`);
  assert.ok(layout.bodyScrollWidth <= SETTINGS_VIEWPORT.width, `${label}: Settings body has no horizontal overflow`);
  assert.equal(Math.round(layout.shell.width), SETTINGS_VIEWPORT.width, `${label}: Settings shell keeps native-sized width`);
  assert.equal(Math.round(layout.shell.height), SETTINGS_VIEWPORT.height, `${label}: Settings shell keeps native-sized height`);
  assert.equal(Math.round(layout.sidebar.width), 190, `${label}: Settings uses the approved compact Feature navigation column`);
  assert.equal(Math.round(layout.inspector.width), 220, `${label}: Settings uses the approved Context Inspector column`);
  assert.ok(layout.configuration.left >= layout.sidebar.right - 0.5, `${label}: Configuration starts after Feature navigation`);
  assert.ok(layout.configuration.right <= layout.inspector.left + 0.5, `${label}: Configuration stops before Context Inspector`);
  assert.ok(layout.footer.top >= layout.configuration.top && layout.footer.bottom <= layout.configuration.bottom + 0.5, `${label}: fixed Settings footer remains inside Configuration`);
  assert.equal(Math.round(layout.footer.height), 34, `${label}: Settings action strip follows the compact 34px rhythm`);
  assert.equal(layout.footerShadow, "none", `${label}: Settings footer uses a quiet hairline instead of an upward shadow`);
  assert.equal(layout.titlebar?.background, PALETTE_SURFACE, `${label}: titlebar shares the continuous Palette ink surface`);
  assert.equal(layout.titlebar?.borderBottom, "1px", `${label}: titlebar uses a weak structural hairline`);
  assert.equal(layout.title, "16px", `${label}: compact detail title follows the shared instrument hierarchy`);
  assert.equal(layout.section, "14px", `${label}: section heading follows the 14px role`);
  assert.equal(layout.navLabel, "13px", `${label}: navigation label follows the 13px role`);
  assert.ok(layout.detailIcon, `${label}: Configuration has a compact current-generation icon`);
  assert.ok(layout.detailIcon && Math.round(layout.detailIcon.rect.width) === 16 && Math.round(layout.detailIcon.rect.height) === 16, `${label}: detail icon stays in the shared 14–16px slot`);
  assert.equal(layout.detailIcon.background, "rgba(0, 0, 0, 0)", `${label}: detail icon has no accent tile fill`);
  assert.equal(layout.detailIcon.border, "0px", `${label}: detail icon has no tile border`);
  if (layout.selected) {
    assert.equal(layout.selected.background, "rgb(231, 232, 234)", `${label}: selected Settings row uses the exact Palette light-neutral anchor`);
    assert.equal(layout.selected.text, "rgb(23, 25, 29)", `${label}: selected Settings row uses the exact Palette dark foreground`);
    assert.equal(layout.selected.icon, layout.selected.text, `${label}: selected Settings icon remains monochrome with its label`);
    assert.equal(layout.selected.height, "30px", `${label}: Settings navigation follows the 30px Palette row rhythm`);
  }
  assert.equal(layout.search?.height, "30px", `${label}: Feature search uses the compact shared control rhythm`);
  assert.equal(layout.search?.borderRadius, "4px", `${label}: Feature search reuses the Palette field radius`);
  for (const action of layout.inspectorActions) {
    assert.equal(action.height, "30px", `${label}: Inspector lifecycle actions use the shared compact control height`);
    assert.equal(action.borderWidth, "1px", `${label}: Inspector lifecycle actions remain visibly bordered secondary controls`);
    assert.notEqual(action.borderColor, "rgba(0, 0, 0, 0)", `${label}: Inspector lifecycle actions do not read as borderless metadata`);
    assert.equal(action.icons, 1, `${label}: Inspector lifecycle actions use one monochrome Lucide icon`);
  }
  if (layout.effectiveStatus?.text === "Ready" || layout.effectiveStatus?.text === "已就绪") {
    assert.equal(layout.readyDot, "rgb(99, 193, 116)", `${label}: only real Ready receives the semantic green dot`);
  } else {
    assert.equal(layout.readyDot, null, `${label}: non-Ready status does not receive a success dot`);
  }
  if (layout.control) {
    assert.equal(layout.control.height, "30px", `${label}: Settings fields follow the compact control rhythm`);
    assert.equal(layout.control.background, "rgba(0, 0, 0, 0.12)", `${label}: Settings fields use the Palette inset fill`);
  }
  for (const candidate of layout.candidates) {
    assert.ok(candidate.left >= -0.5 && candidate.right <= SETTINGS_VIEWPORT.width + 0.5, `${label}: visible Settings content stays inside the viewport`);
  }
  return layout;
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
    const panel = document.querySelector(".interaction-panel");
    const footer = document.querySelector(".palette-footer");
    const candidates = [...document.querySelectorAll(".launcher-search, .search-control, .command-row, .interaction-row, .interaction-list, .palette-event-feedback")]
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
      shadowPadding: getComputedStyle(shell).getPropertyValue("--palette-shadow-padding").trim(),
      mainRadius: getComputedStyle(main).borderRadius,
      panelRadius: panel ? getComputedStyle(panel).borderRadius : null,
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
  assert.equal(layout.shadowPadding, `${PALETTE_SHADOW_PADDING}px`, `${label}: renderer uses the shared native shadow padding`);
  assert.equal(Math.round(layout.main.width), MAIN_VIEWPORT.width, `${label}: visible main remains fixed at 240px`);
  assert.equal(Math.round(layout.main.height), MAIN_VIEWPORT.height, `${label}: visible main remains fixed at 320px`);
  assert.equal(Math.round(layout.main.left), PALETTE_SHADOW_PADDING, `${label}: hosted visible main is inset by the exact shadow padding`);
  assert.equal(Math.round(layout.main.top), PALETTE_SHADOW_PADDING, `${label}: hosted visible main is inset by the exact shadow padding`);
  assert.equal(layout.mainRadius, "8px", `${label}: shared Palette paint radius remains 8px`);
  assert.ok(layout.footer.top >= layout.main.top && layout.footer.bottom <= layout.main.bottom, `${label}: footer remains inside the visible main surface`);
  if (layout.panel) {
    assert.deepEqual(viewport, INTERACTION_WINDOW_VIEWPORT, `${label}: Interaction Panel uses the padded 532×336 native envelope`);
    assert.equal(Math.round(layout.panel.left), PALETTE_SHADOW_PADDING + 256, `${label}: panel keeps the 16px visual gap after the shared inset`);
    assert.equal(Math.round(layout.panel.width), 260, `${label}: panel uses the reference width`);
    assert.ok(layout.panel.height >= 60 && layout.panel.height <= 180, `${label}: panel height is content-fit and bounded`);
    assert.equal(layout.panelRadius, "4px", `${label}: Interaction Panel paint radius remains 4px`);
  }
  for (const candidate of layout.candidates) {
    assert.ok(candidate.left >= -0.5 && candidate.right <= viewport.width + 0.5, `${label}: content remains horizontally inside the viewport`);
  }
  return layout;
}

async function inspectBrowserPreviewLayout(page, label, { compact = false } = {}) {
  const viewport = page.viewportSize();
  await page.locator("#root").evaluate((root) => {
    root.scrollLeft = 0;
    root.scrollTop = 0;
  });
  const layout = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const root = document.getElementById("root");
    const shell = document.querySelector(".palette-shell");
    const main = document.querySelector(".palette-main");
    const panel = document.querySelector(".interaction-panel");
    return {
      root: {
        clientWidth: root.clientWidth,
        clientHeight: root.clientHeight,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        overflowX: getComputedStyle(root).overflowX,
        overflowY: getComputedStyle(root).overflowY
      },
      shell: rect(shell),
      main: rect(main),
      panel: panel ? rect(panel) : null,
      shadowPadding: getComputedStyle(shell).getPropertyValue("--palette-shadow-padding").trim(),
      mainRadius: getComputedStyle(main).borderRadius,
      panelRadius: panel ? getComputedStyle(panel).borderRadius : null,
      commands: document.querySelectorAll(".command-row").length,
      hasElectronHost: Boolean(window.resolveCommandCenter),
      commandNames: [...document.querySelectorAll(".command-name")].map((element) => element.textContent)
    };
  });
  const previewWindow = layout.panel ? INTERACTION_WINDOW_VIEWPORT : PALETTE_WINDOW_VIEWPORT;
  const previewVisibleWidth = layout.panel ? INTERACTION_VIEWPORT.width : MAIN_VIEWPORT.width;

  assert.equal(layout.hasElectronHost, false, `${label}: root preview does not inject an Electron host API`);
  assert.equal(layout.shadowPadding, `${PALETTE_SHADOW_PADDING}px`, `${label}: preview shares the native shadow-padding source`);
  assert.equal(Math.round(layout.shell.width), previewWindow.width, `${label}: preview shell matches its padded native envelope`);
  assert.equal(Math.round(layout.shell.height), previewWindow.height, `${label}: preview shell includes the vertical shadow padding`);
  assert.equal(Math.round(layout.main.width), MAIN_VIEWPORT.width, `${label}: preview main remains fixed at 240px`);
  assert.equal(Math.round(layout.main.height), MAIN_VIEWPORT.height, `${label}: preview main remains fixed at 320px`);
  assert.equal(Math.round(layout.main.left), Math.round(layout.shell.left + PALETTE_SHADOW_PADDING), `${label}: preview main remains inside the shared shadow padding`);
  assert.equal(Math.round(layout.main.top), Math.round(layout.shell.top + PALETTE_SHADOW_PADDING), `${label}: preview main remains inside the shared shadow padding`);
  assert.equal(layout.mainRadius, "8px", `${label}: preview shares the Palette 8px paint radius`);
  assert.equal(layout.commands, 2, `${label}: browser preview exposes only its representative visible commands`);
  assert.deepEqual(layout.commandNames, ["Preview Color Grade", "Preview Timeline"], `${label}: preview uses isolated representative command metadata`);

  if (layout.panel) {
    assert.equal(Math.round(layout.panel.left), Math.round(layout.shell.left + PALETTE_SHADOW_PADDING + 256), `${label}: preview panel keeps the 16px visual gap`);
    assert.equal(Math.round(layout.panel.width), 260, `${label}: preview panel keeps the 260px width`);
    assert.ok(layout.panel.height >= 60 && layout.panel.height <= 180, `${label}: preview panel remains content-fit and bounded`);
    assert.equal(layout.panelRadius, "4px", `${label}: preview panel shares the 4px paint radius`);
    assert.equal(Math.round(layout.panel.right), Math.round(layout.shell.right - PALETTE_SHADOW_PADDING), `${label}: preview envelope keeps padding beyond the right panel shadow`);
  }

  if (!compact) {
    assert.equal(Math.round(layout.shell.left), Math.round((viewport.width - previewWindow.width) / 2), `${label}: preview centers its padded shell horizontally`);
    assert.equal(Math.round(layout.shell.top), Math.round((viewport.height - previewWindow.height) / 2), `${label}: preview centers its padded shell vertically`);
    assert.equal(Math.round(layout.main.left), Math.round((viewport.width - previewVisibleWidth) / 2), `${label}: preview centers the visible main or main-plus-panel composition horizontally`);
    assert.equal(Math.round(layout.main.top), Math.round((viewport.height - MAIN_VIEWPORT.height) / 2), `${label}: preview centers the visible 320px main vertically`);
    return layout;
  }

  assert.equal(layout.root.overflowX, "auto", `${label}: narrow preview owns horizontal scrolling`);
  assert.equal(layout.root.overflowY, "auto", `${label}: short preview owns vertical scrolling`);
  assert.ok(layout.root.scrollWidth > layout.root.clientWidth, `${label}: fixed preview envelope can scroll horizontally instead of clipping`);
  assert.ok(layout.root.scrollHeight > layout.root.clientHeight, `${label}: fixed preview envelope can scroll vertically instead of clipping`);
  assert.ok(layout.shell.left >= BROWSER_PREVIEW_SAFE_EDGE - 0.5, `${label}: preview starts at its left safe edge`);
  assert.ok(layout.shell.top >= BROWSER_PREVIEW_SAFE_EDGE - 0.5, `${label}: preview starts at its top safe edge`);
  const reachable = await page.locator("#root").evaluate((root) => {
    root.scrollLeft = root.scrollWidth;
    root.scrollTop = root.scrollHeight;
    const shell = document.querySelector(".palette-shell").getBoundingClientRect();
    const main = document.querySelector(".palette-main").getBoundingClientRect();
    const panel = document.querySelector(".interaction-panel")?.getBoundingClientRect();
    return {
      scrollLeft: root.scrollLeft,
      scrollTop: root.scrollTop,
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      envelopeRight: Math.max(shell.right, main.right, panel?.right || Number.NEGATIVE_INFINITY),
      envelopeBottom: Math.max(shell.bottom, main.bottom, panel?.bottom || Number.NEGATIVE_INFINITY)
    };
  });
  assert.ok(reachable.scrollLeft > 0 && reachable.envelopeRight >= reachable.clientWidth - BROWSER_PREVIEW_SAFE_EDGE, `${label}: preview right safe edge remains reachable (${JSON.stringify(reachable)})`);
  assert.ok(reachable.scrollTop > 0 && reachable.envelopeBottom >= reachable.clientHeight - BROWSER_PREVIEW_SAFE_EDGE, `${label}: preview bottom safe edge remains reachable (${JSON.stringify(reachable)})`);
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
      panel: color(".interaction-panel"),
      footerText: color(".footer-control", "color"),
      sectionText: color(".command-section h2, .list-heading", "color"),
      metadataText: color(".command-row:not(.selected) .command-detail", "color"),
      commandText: getComputedStyle(document.documentElement).getPropertyValue("--color-text-secondary").trim()
    };
  });
  const surface = rgba(surfaces.content);

  assert.equal(surfaces.content, PALETTE_SURFACE, `${label}: Palette surface matches the approved #151619 authority`);
  assert.equal(surfaces.main, surfaces.content, `${label}: main background continues the Palette content field`);
  assert.equal(surfaces.footer, surfaces.content, `${label}: footer remains in the Palette surface family, not a dark toolbar`);
  if (surfaces.panel) {
    assert.equal(surfaces.panel, INTERACTION_SURFACE, `${label}: Interaction Panel shares the approved #151619 Palette surface`);
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
    const text = row.querySelector(".command-name, .interaction-action-name");
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

async function assertInteractionLabelsPresentFully(page, label) {
  const labels = await page.locator(".interaction-action-name").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      textHeight: element.getBoundingClientRect().height,
      scrollHeight: element.scrollHeight,
      lineHeight,
      whiteSpace: style.whiteSpace,
      textOverflow: style.textOverflow
    };
  }));
  expect(labels.length > 0, `${label}: renders registered action labels`);
  for (const action of labels) {
    assert.equal(action.whiteSpace, "normal", `${label}: action labels may wrap naturally`);
    assert.notEqual(action.textOverflow, "ellipsis", `${label}: action labels never ellipsize`);
    assert.ok(action.scrollWidth <= action.clientWidth + 1, `${label}: action labels do not clip horizontally`);
    assert.ok(action.scrollHeight <= Math.ceil(action.lineHeight * 2) + 1, `${label}: ordinary action labels stay within roughly two lines`);
    assert.ok(action.scrollHeight <= Math.ceil(action.textHeight) + 1, `${label}: action labels present their complete text`);
  }
}

async function assertInteractionScrollContainment(page, label) {
  const containment = await page.locator(".interaction-panel").evaluate((panel) => {
    const list = panel.querySelector(".interaction-list");
    const sourceRow = list?.querySelector(".interaction-row");
    if (!list || !sourceRow) return null;
    for (let index = 0; index < 12; index += 1) {
      const clone = sourceRow.cloneNode(true);
      clone.setAttribute("data-evidence-clone", String(index));
      list.append(clone);
    }
    const before = panel.scrollTop;
    panel.scrollTop = panel.scrollHeight;
    const style = getComputedStyle(panel);
    return {
      before,
      after: panel.scrollTop,
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      height: panel.getBoundingClientRect().height,
      overflowY: style.overflowY
    };
  });
  expect(containment, `${label}: mapping panel is available for overflow containment`);
  assert.equal(containment.overflowY, "auto", `${label}: Interaction Panel owns vertical scrolling`);
  assert.ok(containment.height <= INTERACTION_PANEL.maxHeight, `${label}: panel itself stays within its maximum height`);
  assert.ok(containment.scrollHeight > containment.clientHeight, `${label}: overflowing mappings stay inside the panel`);
  assert.ok(containment.after > containment.before, `${label}: panel can scroll vertically through overflowing mappings`);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function decodeRgbaPng(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "screenshot is a PNG");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  const chunks = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      chunks.push(data);
    }
  }
  assert.equal(bitDepth, 8, "screenshot uses 8-bit channels");
  assert.equal(colorType, 6, "transparent screenshot exposes RGBA alpha");
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const compressed = inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = compressed[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    const previousOffset = rowOffset - stride;
    for (let x = 0; x < stride; x += 1) {
      const source = compressed[inputOffset];
      inputOffset += 1;
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[previousOffset + x - bytesPerPixel] : 0;
      if (filter === 0) pixels[rowOffset + x] = source;
      else if (filter === 1) pixels[rowOffset + x] = (source + left) & 0xff;
      else if (filter === 2) pixels[rowOffset + x] = (source + up) & 0xff;
      else if (filter === 3) pixels[rowOffset + x] = (source + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) pixels[rowOffset + x] = (source + paeth(left, up, upLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filter}`);
    }
  }
  return {
    width,
    height,
    alphaAt(x, y) {
      const pixelX = Math.max(0, Math.min(width - 1, Math.floor(x)));
      const pixelY = Math.max(0, Math.min(height - 1, Math.floor(y)));
      return pixels[(pixelY * width + pixelX) * bytesPerPixel + 3];
    }
  };
}

async function assertShadowFitsPaddedShell(page, label) {
  const [layout, buffer] = await Promise.all([
    page.evaluate(() => {
      const rect = (element) => element.getBoundingClientRect();
      return {
        shell: rect(document.querySelector(".palette-shell")),
        main: rect(document.querySelector(".palette-main"))
      };
    }),
    page.screenshot({ scale: "css", animations: "disabled", omitBackground: true })
  ]);
  const image = decodeRgbaPng(buffer);
  const sampleY = layout.main.top + layout.main.height / 2;
  const paddingAlpha = image.alphaAt(layout.main.left - PALETTE_SHADOW_PADDING / 2, sampleY);
  const shellEdgeAlpha = image.alphaAt(layout.shell.left, sampleY);
  assert.ok(paddingAlpha > 0, `${label}: compact outer shadow is visibly painted inside the accepted padding`);
  assert.ok(shellEdgeAlpha < paddingAlpha, `${label}: shadow fades before the native-shell edge rather than clipping hard`);
  assert.ok(shellEdgeAlpha <= 4, `${label}: shell edge remains effectively transparent after the compact shadow fade`);
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

async function openInteractionPanel(page, method = "tab") {
  await focusShell(page);
  await page.setViewportSize(INTERACTION_WINDOW_VIEWPORT);
  if (method === "click") await page.getByRole("button", { name: "Open interaction info" }).click();
  else await page.keyboard.press("Tab");
  await page.locator(".interaction-panel").waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Command information");
}

async function openBrowserPreviewInteractionPanel(page, method = "tab") {
  await focusShell(page);
  if (method === "click") await page.getByRole("button", { name: "Open interaction info" }).click();
  else await page.keyboard.press("Tab");
  await page.locator(".interaction-panel").waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Command information");
}

async function closeScenario(scenario, label) {
  assert.deepEqual(scenario.problems, [], `${label}: no unexpected console or page errors`);
  await scenario.context.close();
}

async function runScenario(name, context) {
  const { browser, serverUrl, host, output, evidence, checks } = context;
  const scenario = SETTINGS_EVIDENCE_SCENARIOS.has(name)
    ? await createSettingsPreviewScenario(browser, serverUrl, SETTINGS_FIXTURE_BY_SCENARIO[name], {
      reducedMotion: name === "settings-reduced-motion"
    })
    : name === "browser-preview"
      ? await createBrowserPreviewScenario(browser, serverUrl)
      : await createScenario(browser, serverUrl, host);
  const { page } = scenario;
  try {
    if (SETTINGS_EVIDENCE_SCENARIOS.has(name)) {
      assert.equal(await page.evaluate(() => Boolean(window.resolveCommandCenter)), false, `${name}: Settings fixture has no injected Electron host authority`);
      assert.equal(await page.locator(".clackly-browser-preview-agentation").count(), 0, `${name}: Settings fixture does not mount the Palette preview tool`);
      await page.locator(".settings-configuration h1").waitFor();
      if (name === "settings-typical-ready") {
        assert.equal(await page.locator(".settings-titlebar img").count(), 0, "Settings titlebar renders no Clackly wordmark image");
        assert.equal(await page.locator(".settings-titlebar").innerText(), "Settings", "Settings titlebar keeps only the localized compact title");
        const inspector = page.getByLabel("Context Inspector");
        await inspector.waitFor();
        assert.match(await inspector.innerText(), /Version\s*1\.0\.0/, "Ready Settings About renders version metadata");
        assert.match(await inspector.innerText(), /Providers\s*Script, Electron Host/, "Ready Settings About formats existing provider ids for readable presentation");
        const interaction = page.locator(".settings-inspector .inspector-interaction-command");
        assert.deepEqual(await interaction.locator(".inspector-interaction-action-name").allInnerTexts(), [
          "Export to After Effects",
          "Export Audio to After Effects",
          "Export Video to After Effects"
        ], "Ready Settings Inspector renders registered English action Command names");
        assert.doesNotMatch((await interaction.allInnerTexts()).join("\n"), /Send timeline (audio|video) to After Effects\./, "Ready Settings Inspector rejects action Command descriptions");
      } else if (name === "settings-missing-config-long-path") {
        const pathInput = page.locator("#setting-afterEffectsPath");
        await pathInput.scrollIntoViewIfNeeded();
        assert.match(await pathInput.inputValue(), /^C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\/);
        await page.locator(".feature-effective-status").filter({ hasText: "Needs Setup" }).waitFor();
        assert.equal(await page.locator(".feature-status-reason").innerText(), "Output folder is required before export.", "abnormal Settings status prefers the trusted concise lifecycle message");
      } else if (name === "settings-zh-cn-multi-help") {
        await page.getByRole("heading", { name: "交互" }).scrollIntoViewIfNeeded();
        assert.ok(await page.locator(".inspector-interaction-input kbd").count() >= 5, "Simplified Chinese fixture preserves multi-row keycap help");
        const interaction = page.locator(".settings-inspector .inspector-interaction-command");
        assert.deepEqual(await interaction.locator(".inspector-interaction-action-name").allInnerTexts(), [
          "导出到 After Effects",
          "导出音频到 After Effects",
          "导出视频到 After Effects"
        ], "Simplified Chinese Settings Inspector renders localized registered action Command names");
        assert.doesNotMatch((await interaction.allInnerTexts()).join("\n"), /将时间线(音频|视频)发送到 After Effects。/, "Simplified Chinese Settings Inspector rejects action Command descriptions");
        assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN", "Simplified Chinese fixture applies the localized document language");
      } else if (name === "settings-busy") {
        const save = page.getByRole("button", { name: "Working…" });
        await save.waitFor();
        assert.equal(await save.isDisabled(), true, "busy fixture preserves disabled fixed actions");
      } else if (name === "settings-error") {
        await page.getByRole("button", { name: "Save" }).click();
        await page.locator(".settings-feedback.error").waitFor();
        assert.equal(await page.locator(".settings-feedback.error").innerText(), "Could not save settings. Review the fields and try again.", "error fixture gives Save-specific localized recovery feedback");
      } else if (name === "settings-search-match") {
        const search = page.getByRole("searchbox", { name: "Search Features" });
        await search.fill("clipboard");
        assert.deepEqual(await page.locator(".feature-navigation .feature-current-category .feature-button").allInnerTexts(), ["Export to After Effects"], "Feature search retains the filtered-out selected Feature in one explicit Current group");
        assert.deepEqual(await page.locator(".feature-navigation .feature-category:not(.feature-current-category) .feature-button").allInnerTexts(), ["Paste Clipboard Image"], "Feature search keeps matching Feature rows in their original category group");
        assert.equal(await page.locator(".settings-configuration h1").innerText(), "Export to After Effects", "typing in Feature search does not switch the current Configuration context");
        assert.equal(await page.locator(".feature-navigation-footer .feature-button").count(), 1, "application Settings destination remains fixed outside filtering");
      } else if (name === "settings-search-empty") {
        const search = page.getByRole("searchbox", { name: "Search Features" });
        await search.fill("not a Feature");
        await page.locator(".feature-search-empty").waitFor();
        assert.equal(await page.locator(".feature-navigation .feature-current-category .feature-button").count(), 1, "Feature search retains only the real current Feature when no result matches");
        assert.equal(await page.locator(".feature-navigation .feature-category:not(.feature-current-category) .feature-button").count(), 0, "Feature search hides empty result groups instead of showing stale rows");
        assert.equal(await page.locator(".feature-search-empty").innerText(), "No matching Features.", "Feature search exposes a truthful accessible empty state");
      } else if (name === "settings-reduced-motion") {
        const motion = await page.locator(".feature-button").first().evaluate((element) => getComputedStyle(element).transitionDuration);
        const saveMotion = await page.getByRole("button", { name: "Save" }).evaluate((element) => getComputedStyle(element).transitionDuration);
        assert.equal(motion, "0s", "reduced motion removes Settings navigation transitions");
        assert.equal(saveMotion, "0s", "reduced motion removes Settings action transitions");
      }
      await inspectSettingsLayout(page, name);
      evidence.push(await screenshot(page, output, `${name}.png`));
      if (name === "settings-busy") {
        const application = page.getByRole("button", { name: "Clackly Settings" });
        assert.equal(await application.isDisabled(), false, "pending config keeps navigation available to cancel the selected Feature load");
        await page.getByRole("button", { name: "Add Timeline Marker" }).click();
        await page.getByRole("heading", { name: "Add Timeline Marker" }).waitFor();
        assert.equal(await page.getByRole("button", { name: "Refresh" }).isDisabled(), false, "changing Feature while its previous config request is pending does not strand busy state");
        await page.getByRole("button", { name: "Export to After Effects", exact: true }).click();
        await page.getByRole("button", { name: "Working…" }).waitFor();
        await application.click();
        await page.getByRole("heading", { name: "Clackly Settings" }).waitFor();
        await page.waitForFunction(() => !document.querySelector("#locale-preference")?.disabled);
        assert.equal(await page.getByRole("combobox", { name: "Language" }).isDisabled(), false, "application fallback cancels the pending config request without retaining busy state");
      }
      checks.push(`${name}: hostless local Settings fixture rendered the approved three-column Settings UI at 760×560 with local Feature search, application footer, configuration action strip, inspector-only effective status and real binding rows; screenshot is renderer-paint evidence only and does not validate Electron or Resolve.`);
      return;
    } else if (name === "browser-preview") {
      await inspectBrowserPreviewLayout(page, name);
      await assertShadowFitsPaddedShell(page, name);
      const agentation = page.locator(".clackly-browser-preview-agentation");
      assert.equal(await agentation.count(), 1, "Root browser preview mounts one local Agentation toolbar");
      const agentationStyle = await agentation.evaluate((element) => {
        const style = getComputedStyle(element);
        return { position: style.position, zIndex: Number(style.zIndex), pointerEvents: style.pointerEvents };
      });
      assert.equal(agentationStyle.position, "fixed", "Agentation stays available while the preview root scrolls");
      assert.ok(agentationStyle.zIndex >= 100000, "Agentation toolbar stays above the browser preview surface");
      assert.equal(agentationStyle.pointerEvents, "none", "Only Agentation's own controls capture preview input");
      assert.equal(await page.locator(".interaction-panel").count(), 0, "Browser preview starts with Interaction Panel closed");
      await openBrowserPreviewInteractionPanel(page, "click");
      const panel = page.locator(".interaction-panel");
      assert.equal(await panel.locator(".interaction-row").count(), 3, "Browser preview maps its local bindings through the shared interaction projection");
      assert.deepEqual(await panel.locator(".interaction-action-name").allInnerTexts(), [
        "Preview Color Grade",
        "Inspect Preview Details",
        "Adjust Preview Settings"
      ], "Browser preview renders local action labels through the real panel component");
      assert.equal(await panel.locator(".interaction-preview-note").innerText(), "Preview only — commands run in Electron.", "Browser preview keeps its execution note inside the Interaction Panel");
      await inspectBrowserPreviewLayout(page, `${name}-open`);
      await assertShadowFitsPaddedShell(page, `${name}-open`);
      await inspectSurfaceHierarchy(page, `${name}-open`);
      await assertInteractionLabelsPresentFully(page, `${name}-open`);
      assert.equal(await agentation.count(), 1, "Agentation remains available beside an open Interaction Panel");
      evidence.push(await screenshot(page, output, "browser-preview-open.png"));
      await page.keyboard.press("Tab");
      await panel.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.classList.contains("palette-shell"));
      await page.locator(".launcher-view .command-row").first().click();
      await panel.waitFor();
      assert.equal(await page.locator(".palette-event-feedback.error").count(), 0, "Browser preview command activation opens Information without execution-error feedback");
      assert.equal(await panel.locator(".interaction-preview-note").innerText(), "Preview only — commands run in Electron.", "Activation retains the preview-only note inside the panel");
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.classList.contains("palette-shell"));
      await openBrowserPreviewInteractionPanel(page);
      await page.keyboard.press("Escape");
      await panel.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.classList.contains("palette-shell"));
      await page.setViewportSize(BROWSER_PREVIEW_SMALL_VIEWPORT);
      await openBrowserPreviewInteractionPanel(page, "click");
      await inspectBrowserPreviewLayout(page, `${name}-small-open`, { compact: true });
      evidence.push(await screenshot(page, output, "browser-preview-small-open.png"));
      checks.push("Root browser preview has no injected Electron host: isolated renderer-local data drives the real Palette and Interaction Panel; Agentation's fixed local toolbar stays above the preview without a host or external route; Info, Tab, Escape, and command activation retain the panel lifecycle, while activation remains quiet and carries its preview-only note inside the panel; the visible 240×320/516×320 compositions center inside shared 256×336/532×336 shadow envelopes, whose alpha fades before the shell edge and scroll to safe edges when small");
    } else if (name === "default") {
      await inspectLayout(page, name);
      await assertShadowFitsPaddedShell(page, name);
      assert.equal(await page.locator(".clackly-browser-preview-agentation, [data-feedback-toolbar]").count(), 0, "Host-injected Electron renderer never mounts Agentation");
      assert.equal(await page.locator(".interaction-preview-note").count(), 0, "Host-injected Palette has no browser-preview execution note");
      const surfaces = await inspectSurfaceHierarchy(page, name);
      await assertRowsSingleLine(page, ".command-row", name);
      assert.equal(await page.locator(".alphabet-rail, [aria-label*='actions' i]").count(), 0, "Default exposes no legacy Actions surface");
      const footer = await page.locator(".palette-footer").evaluate((element) => ({
        keycaps: [...element.querySelectorAll("kbd")].map((keycap) => keycap.textContent),
        buttons: [...element.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"))
      }));
      assert.deepEqual(footer.keycaps, [], "Footer exposes no legacy Ctrl/K keycaps");
      assert.equal(footer.buttons[0], "Settings", "Settings remains the leftmost footer affordance");
      expect(footer.buttons[1].startsWith("Pin "), "Pin follows Settings in the footer");
      assert.equal(footer.buttons[2], "Open interaction info", "Metadata-backed Info stays on the Footer right");
      await page.getByRole("button", { name: "Settings" }).focus();
      assert.equal(await page.getByRole("button", { name: "Settings" }).evaluate((element) => getComputedStyle(element).outlineColor), "rgb(231, 232, 234)", "Palette focus uses shared light-neutral emphasis");
      const commandRows = page.locator(".launcher-view .command-row");
      for (let index = 0; index < await commandRows.count(); index += 1) {
        await commandRows.nth(index).focus();
        assert.equal(await page.getByRole("button", { name: "Open interaction info" }).count(), 1, "Every selected Command exposes Info");
      }
      assert.doesNotMatch(await page.locator(".palette-main").innerText(), /\bActions\b/, "Default contains no user-visible legacy Actions copy");
      evidence.push(await screenshot(page, output, "default.png"));
      checks.push(`default command shell: visible 240×320 inside a 256×336 shared shadow envelope, Settings→Pin left, universal selected-Command Info right, no legacy Ctrl/K or Actions copy, compact command rows, unified ${surfaces.content} main/Footer surface with inset Search and ${surfaces.mutedContrast[0].ratio.toFixed(2)}:1 readable Footer text`);
    } else if (name === "pinned-recent") {
      await page.getByRole("button", { name: /pin export to after effects/i }).click();
      const pin = page.locator(".pin-indicator").first();
      await pin.waitFor();
      assert.equal(await pin.evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(231, 232, 234)", "Palette pin uses shared light-neutral emphasis");
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
      await assertShadowFitsPaddedShell(page, name);
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "pinned-recent.png"));
      checks.push("real UI Pin plus Command execution projects nonempty Pinned and Recent sections without duplicates");
    } else if (name === "search-results") {
      await page.locator(".launcher-search").click();
      const input = page.locator(".search-control input");
      await input.fill("clipboard");
      await page.waitForFunction(() => (
        document.querySelector(".search-control input")?.value === "clipboard"
        && document.querySelectorAll(".search-view .command-row").length === 1
      ));
      assert.equal(await page.locator(".search-view .command-row").count(), 1, "Search uses the shared policy to filter the evidence catalog");
      await input.fill("ar");
      await page.waitForFunction(() => (
        document.querySelector(".search-control input")?.value === "ar"
        && document.querySelectorAll(".search-view .command-row").length > 1
      ));
      assert.equal((await readState(page)).searchRequests.at(-1)?.query, "ar", "Search evidence uses a discovery-eligible query rather than a weak one-letter token");
      assert.ok(await page.locator(".search-view .command-row").count() > 1, "Search keeps multiple real command results for discovery-eligible input");
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
    } else if (name === "interaction-single-description") {
      await page.locator(".launcher-view .command-row").first().hover();
      await page.waitForTimeout(850);
      assert.equal(await page.locator(".interaction-panel").count(), 0, "Hover and dwell never auto-open Interaction Panel");
      await focusShell(page);
      await page.keyboard.press("ArrowDown");
      assert.equal(await page.getByRole("button", { name: "Open interaction info" }).count(), 1, "Single-interaction Command keeps the universal Info entry");
      assert.equal(await page.locator(".interaction-panel").count(), 0, "Selection change does not auto-open Interaction Panel");
      await openInteractionPanel(page, "click");
      const panel = page.locator(".interaction-panel");
      assert.equal(await panel.locator(".interaction-row").count(), 0, "Single/default interaction does not render mappings");
      assert.equal(await panel.locator(".interaction-description").innerText(), "Save the Clipboard image and import it into the Resolve Media Pool", "Single/default interaction renders only the registered Command description");
      assert.equal(await panel.locator("h1, h2, input, footer, .empty-state, [class*='arrow']").count(), 0, "Description panel has no title, search, footer, empty state, or triangle");
      await inspectLayout(page, name);
      await inspectSurfaceHierarchy(page, name);
      evidence.push(await screenshot(page, output, "interaction-single-description.png"));
      checks.push("hover/dwell and selection never auto-open; a single/default interaction keeps Info and opens a description-only panel");
    } else if (name === "interaction-panel") {
      await focusShell(page);
      await page.keyboard.press("Control+k");
      assert.equal(await page.locator(".interaction-panel").count(), 0, "Ctrl+K has no hidden compatibility path");
      await page.locator(".launcher-search").click();
      await page.locator(".search-control input").fill("export");
      await page.keyboard.press("Tab");
      assert.equal(await page.locator(".interaction-panel").count(), 0, "Tab from Search input does not impersonate Command selection focus");
      await page.keyboard.press("Escape");
      await page.locator(".launcher-view").waitFor();
      await openInteractionPanel(page, "click");
      const panel = page.locator(".interaction-panel");
      const rows = panel.locator(".interaction-row");
      assert.equal(await rows.count(), 3, "Interaction Panel renders domain-derived mappings only");
      assert.equal(await page.getByRole("button", { name: "Close interaction info" }).getAttribute("aria-pressed"), "true", "Footer Info exposes its subdued active state");
      assert.equal(await panel.locator("h1, h2, input, footer, .empty-state, [class*='arrow']").count(), 0, "Panel has no title, search, footer, empty state, or triangle");
      assert.equal(await panel.locator(".interaction-description").count(), 0, "Multi-interaction panel never combines mappings with a description");
      assert.equal(await panel.locator(".interaction-preview-note").count(), 0, "Host-injected Interaction Panel has no browser-preview execution note");
      assert.doesNotMatch(await panel.innerText(), /Automatically send the current Resolve selection/, "Panel omits Command descriptions");
      const interactionInputs = await rows.locator(".interaction-input").evaluateAll((elements) => (
        elements.map((element) => element.textContent.replace(/\s+/g, ""))
      ));
      assert.deepEqual(interactionInputs, ["Click", "Ctrl+Click", "Ctrl+Shift+Click"], "Panel preserves compact canonical input mappings");
      assert.deepEqual(await rows.locator(".interaction-action-name").allInnerTexts(), ["Export to After Effects", "Export Audio to After Effects", "Export Video to After Effects"], "Panel uses registered action Command labels");
      await page.mouse.move(248, 319);
      await inspectLayout(page, name);
      await assertShadowFitsPaddedShell(page, name);
      await inspectSurfaceHierarchy(page, name);
      await assertInteractionLabelsPresentFully(page, name);
      evidence.push(await screenshot(page, output, "interaction-panel.png"));
      await assertInteractionScrollContainment(page, name);
      await page.getByRole("button", { name: "Close interaction info" }).click();
      await panel.waitFor({ state: "detached" });
      checks.push("Ctrl+K has no compatibility path; Search-input Tab stays normal; Info click toggles a visible 260px, content-fit Interaction Panel with a 16px gap inside the padded two-rectangle native shape, #151619 shared surface, compact shared shadow, complete wrapped mappings, and contained vertical overflow");
    } else if (name === "interaction-lifecycle") {
      await openInteractionPanel(page);
      await page.keyboard.press("Tab");
      await page.locator(".interaction-panel").waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.classList.contains("palette-shell"));
      await openInteractionPanel(page);
      await page.keyboard.press("Escape");
      await page.locator(".interaction-panel").waitFor({ state: "detached" });
      await openInteractionPanel(page);
      await page.locator(".launcher-view .command-row").nth(1).focus();
      await page.locator(".interaction-panel").waitFor({ state: "detached" });
      assert.equal(await page.getByRole("button", { name: "Open interaction info" }).count(), 1, "Selection change closes the old panel while preserving universal Info");
      await page.locator(".launcher-view .command-row").first().focus();
      await openInteractionPanel(page);
      await page.locator(".launcher-view .command-row").first().click();
      await page.locator(".interaction-panel").waitFor({ state: "detached" });
      await openInteractionPanel(page);
      await page.evaluate(() => window.__clacklyPaletteEvidence.onShown?.());
      await page.locator(".interaction-panel").waitFor({ state: "detached" });
      const state = await readState(page);
      assert.equal(state.interactions.length, 1, "Command-row interaction execution retains the existing IPC path");
      assert.ok(state.interactionPanelMetrics.every(({ anchorY, contentHeight }) => Number.isInteger(anchorY) && Number.isInteger(contentHeight)), "Renderer sends only bounded semantic panel measurements");
      assert.ok(state.interactionPanelCloseCount > 0, "Tab, Esc, selection, execute, and Palette reset close host presentation");
      checks.push("Tab enters/returns, Esc closes first, and selection/execute/Palette-show lifecycle leaves no stale Interaction Panel");
    } else if (name === "interaction-host-unavailable") {
      await scenario.context.close();
      for (const interactionPanelFailure of ["null", "reject"]) {
        const unavailableScenario = await createScenario(browser, serverUrl, { ...host, interactionPanelFailure });
        const unavailablePage = unavailableScenario.page;
        await focusShell(unavailablePage);
        await unavailablePage.setViewportSize(INTERACTION_WINDOW_VIEWPORT);
        await unavailablePage.keyboard.press("Tab");
        await unavailablePage.getByText("Interaction panel is unavailable.").waitFor();
        await unavailablePage.locator(".interaction-panel").waitFor({ state: "detached" });
        await unavailablePage.waitForFunction(() => document.activeElement?.classList.contains("palette-shell"));
        const state = await readState(unavailablePage);
        assert.ok(state.interactionPanelMetrics.length > 0, `Interaction Panel ${interactionPanelFailure} attempted semantic host metrics`);
        assert.ok(state.interactionPanelCloseCount > 0, `Interaction Panel ${interactionPanelFailure} fails closed safely`);
        if (interactionPanelFailure === "null") evidence.push(await screenshot(unavailablePage, output, "interaction-host-unavailable.png"));
        await closeScenario(unavailableScenario, `interaction-host-unavailable-${interactionPanelFailure}`);
      }
      checks.push("Null and rejected Interaction Panel host intent fail closed, refocus the Palette, and show concise persistent error feedback");
      return;
    } else if (name === "error-feedback") {
      const commandFailure = "Command bridge is unavailable. Open Settings to recover, then retry.";
      const localizedFailure = "The command could not be completed.";
      await scenario.context.close();
      const errorScenario = await createScenario(browser, serverUrl, { ...host, commandFailure });
      const errorPage = errorScenario.page;
      await focusShell(errorPage);
      await errorPage.waitForFunction(() => window.__clacklyPaletteEvidence.searchRequests.length > 0);
      const directSearchCount = (await readState(errorPage)).searchRequests.length;
      await errorPage.keyboard.press("Enter");
      const feedback = errorPage.locator(".palette-event-feedback.error");
      await feedback.waitFor();
      await errorPage.waitForFunction((count) => window.__clacklyPaletteEvidence.searchRequests.length > count, directSearchCount);
      assert.equal(await feedback.textContent(), localizedFailure, "Error feedback presents the localized generic failure instead of raw bridge detail");
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
      const interactionScenario = await createScenario(browser, serverUrl, { ...host, interactionFailure: commandFailure });
      const interactionPage = interactionScenario.page;
      await focusShell(interactionPage);
      await interactionPage.waitForFunction(() => window.__clacklyPaletteEvidence.searchRequests.length > 0);
      const interactionSearchCount = (await readState(interactionPage)).searchRequests.length;
      await interactionPage.locator(".command-row").first().click();
      await interactionPage.locator(".palette-event-feedback.error").waitFor();
      await interactionPage.waitForFunction((count) => window.__clacklyPaletteEvidence.searchRequests.length > count, interactionSearchCount);
      await closeScenario(interactionScenario, `${name}-interaction`);
      checks.push("Errors remain visible as localized presentation copy, keep their full aria-live text, and use a compact readable three-line maximum rather than acknowledgement auto-dismissal");
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
  const commands = await loadCommands(commandRoot);
  const capabilities = [...new Set(commands.map((command) => command.capability))];
  const host = {
    commands,
    bindings: createBindings(commands),
    statuses: capabilities.map(readyStatus),
    interactionPanel: INTERACTION_PANEL
  };
  await mkdir(options.output, { recursive: true });
  const { server, url } = await startStaticServer(rendererRoot);
  const executablePath = await access(options.browser).then(() => options.browser).catch(() => undefined);
  const browser = await chromium.launch({ headless: !options.headed, ...(executablePath ? { executablePath } : {}) });
  const evidence = [];
  const checks = [];
  const settingsOnly = [...options.scenarios].every((scenario) => SETTINGS_EVIDENCE_SCENARIOS.has(scenario));
  try {
    for (const scenario of SCENARIOS) {
      if (options.scenarios.has(scenario)) await runScenario(scenario, { browser, serverUrl: url, host, output: options.output, evidence, checks });
    }
    const report = {
      scope: settingsOnly
        ? "Developer-only Playwright Settings renderer-paint evidence. Explicit hostless Settings fixtures use cloned renderer-local presentation data and no Electron host authority."
        : "Developer-only Playwright renderer evidence. Browser-process host stubs expose registered Commands, normalized interaction bindings, and semantic Interaction Panel intent; root browser preview intentionally omits that host API and uses only its isolated renderer-local presentation adapter plus local Agentation toolbar.",
      limitations: settingsOnly
        ? [
          "This proves built/packaged Settings renderer DOM, CSS, keyboard, and pointer behavior only.",
          "It does not prove Electron native-window transparency, DWM, taskbar, focus, package installation, Resolve Workflow lifecycle, or Resolve command execution."
        ]
        : [
          "This proves built/packaged renderer DOM, CSS, keyboard, and pointer behavior only.",
          "It does not prove Electron setShape/DWM composition, transparent-gap hit testing, cursor placement, native focus, package installation, Resolve Workflow lifecycle, or Resolve command execution."
        ],
      playwrightVersion,
      browser: { channel: executablePath ? "explicit browser executable" : "Playwright Chromium", version: browser.version(), headless: !options.headed },
      renderer: options.renderer,
      rendererRoot,
      output: options.output,
      viewports: {
        visibleMain: MAIN_VIEWPORT,
        visibleInteraction: INTERACTION_VIEWPORT,
        nativeMain: PALETTE_WINDOW_VIEWPORT,
        nativeInteraction: INTERACTION_WINDOW_VIEWPORT,
        browserPreview: BROWSER_PREVIEW_VIEWPORT,
        browserPreviewSmall: BROWSER_PREVIEW_SMALL_VIEWPORT,
        shadowPadding: PALETTE_SHADOW_PADDING,
        deviceScaleFactor: 1
      },
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
