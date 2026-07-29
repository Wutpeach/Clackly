const { app, dialog, ipcMain } = require("electron");
const { createPaletteWindow, hidePaletteWindow, showPaletteWindow } = require("../electron/main/window");
const { registerPaletteHotkey } = require("../electron/main/hotkey");
const { getCommandById, getCommands, searchCommands } = require("../command-engine/registry");

const PLUGIN_ID = "com.wutpeach.clackly";
const MARKER_COLOR = "Red";
const MARKER_NAME = "Clackly Marker";
const MARKER_NOTE = "Added from Clackly";
const MARKER_DURATION = 1;
const MARKER_CUSTOM_DATA = "clackly";

let WorkflowIntegration = null;
let paletteWindow = null;
let initPromise = null;
let resolvePromise = null;
let cleanupDone = false;

function loadWorkflowIntegration() {
  if (WorkflowIntegration) {
    return WorkflowIntegration;
  }

  try {
    WorkflowIntegration = require("./WorkflowIntegration.node");
    return WorkflowIntegration;
  } catch (error) {
    throw new Error(
      `WorkflowIntegration.node is missing or could not be loaded: ${error.message}`
    );
  }
}

async function initializeWorkflowIntegration() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const workflowIntegration = loadWorkflowIntegration();
    const initialized = typeof workflowIntegration.InitializePromise === "function"
      ? await workflowIntegration.InitializePromise(PLUGIN_ID)
      : await Promise.resolve(workflowIntegration.Initialize(PLUGIN_ID));

    if (!initialized) {
      throw new Error("Failed to initialize Resolve Workflow Integration");
    }

    if (typeof workflowIntegration.RegisterCallback === "function") {
      workflowIntegration.RegisterCallback("ResolveQuit", () => {
        app.quit();
      });
    }

    return workflowIntegration;
  })();

  return initPromise;
}

async function getResolve() {
  if (resolvePromise) {
    return resolvePromise;
  }

  resolvePromise = (async () => {
    const workflowIntegration = await initializeWorkflowIntegration();
    const resolve = typeof workflowIntegration.GetResolvePromise === "function"
      ? await workflowIntegration.GetResolvePromise()
      : await Promise.resolve(workflowIntegration.GetResolve());

    if (!resolve) {
      throw new Error("Failed to get Resolve object from Workflow Integration");
    }

    return resolve;
  })();

  return resolvePromise;
}

async function callOptional(target, methodName, ...args) {
  const method = target && target[methodName];
  if (typeof method !== "function") {
    return null;
  }

  try {
    return await Promise.resolve(method.apply(target, args));
  } catch (_error) {
    return null;
  }
}

async function callRequired(target, methodName, errorMessage, ...args) {
  const method = target && target[methodName];
  if (typeof method !== "function") {
    throw new Error(errorMessage);
  }

  const value = await Promise.resolve(method.apply(target, args));
  if (value === null || value === undefined || value === false) {
    throw new Error(errorMessage);
  }

  return value;
}

function parseFrameRate(value) {
  if (value === null || value === undefined) {
    return 24;
  }

  const text = String(value).trim();
  if (!text) {
    return 24;
  }

  if (text.includes("/")) {
    const [numerator, denominator] = text.split("/", 2).map(Number);
    return numerator / denominator;
  }

  return Number(text);
}

function timecodeToFrames(timecode, frameRate) {
  const match = String(timecode).trim().match(/^(\d+):(\d+):(\d+)([:;])(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported timeline timecode: ${timecode}`);
  }

  const [, hours, minutes, seconds, , frames] = match;
  const roundedRate = Math.round(frameRate);
  return (
    Number(hours) * 3600 * roundedRate +
    Number(minutes) * 60 * roundedRate +
    Number(seconds) * roundedRate +
    Number(frames)
  );
}

async function getProjectAndTimeline() {
  const resolve = await getResolve();
  const projectManager = await callRequired(
    resolve,
    "GetProjectManager",
    "Resolve project manager is unavailable"
  );
  const project = await callRequired(
    projectManager,
    "GetCurrentProject",
    "No current Resolve project"
  );
  const timeline = await callRequired(
    project,
    "GetCurrentTimeline",
    "No current timeline"
  );

  return { project, timeline };
}

async function getSetting(target, settingName) {
  return callOptional(target, "GetSetting", settingName);
}

async function currentTimelineFrame(project, timeline) {
  const directFrame = await callOptional(timeline, "GetCurrentFrame");
  if (directFrame !== null && directFrame !== undefined) {
    return Number(directFrame);
  }

  const currentTimecode = await callRequired(
    timeline,
    "GetCurrentTimecode",
    "Could not read the current playhead timecode"
  );
  const frameRate = parseFrameRate(
    (await getSetting(timeline, "timelineFrameRate")) ||
      (await getSetting(project, "timelineFrameRate"))
  );
  const currentFrames = timecodeToFrames(currentTimecode, frameRate);

  const startTimecode = await callOptional(timeline, "GetStartTimecode");
  const startFrame = await callOptional(timeline, "GetStartFrame");
  if (startTimecode) {
    return currentFrames - timecodeToFrames(startTimecode, frameRate) + Number(startFrame || 0);
  }

  return currentFrames;
}

async function addMarker() {
  const { project, timeline } = await getProjectAndTimeline();
  const frame = await currentTimelineFrame(project, timeline);
  const added = await callRequired(
    timeline,
    "AddMarker",
    "Resolve refused to add the marker",
    frame,
    MARKER_COLOR,
    MARKER_NAME,
    MARKER_NOTE,
    MARKER_DURATION,
    MARKER_CUSTOM_DATA
  );

  return {
    ok: Boolean(added),
    frame
  };
}

const RESOLVE_COMMAND_HANDLERS = {
  "timeline.addMarker": addMarker
};

async function executeWorkflowCommand(commandId) {
  const command = getCommandById(commandId);
  if (!command) {
    throw new Error(`Unknown command: ${commandId}`);
  }

  if (command.executor !== "resolve") {
    throw new Error(`Workflow plugin cannot execute ${command.executor} commands`);
  }

  const handler = RESOLVE_COMMAND_HANDLERS[command.id];
  if (!handler) {
    throw new Error(`No Resolve handler registered for ${command.id}`);
  }

  const result = await handler();
  return {
    ok: true,
    command: command.id,
    ...result
  };
}

function showPalette() {
  showPaletteWindow(paletteWindow);
}

function hidePalette() {
  hidePaletteWindow(paletteWindow);
}

function togglePalette() {
  if (paletteWindow && paletteWindow.isVisible()) {
    hidePalette();
    return;
  }

  showPalette();
}

function registerIpcHandlers() {
  ipcMain.handle("commands:list", () => getCommands());
  ipcMain.handle("commands:search", (_event, query) => searchCommands(query));
  ipcMain.handle("commands:execute", async (_event, commandId) => {
    const result = await executeWorkflowCommand(commandId);
    hidePalette();
    return result;
  });
  ipcMain.on("palette:hide", hidePalette);
}

function cleanupWorkflowIntegration() {
  if (cleanupDone || !WorkflowIntegration) {
    return;
  }

  cleanupDone = true;

  try {
    if (typeof WorkflowIntegration.DeregisterCallback === "function") {
      WorkflowIntegration.DeregisterCallback("ResolveQuit");
    }
    WorkflowIntegration.CleanUp();
  } catch (error) {
    console.warn(`Failed to clean up Resolve Workflow Integration: ${error.message}`);
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setName("Clackly");

  app.on("second-instance", () => {
    showPalette();
  });

  app.whenReady().then(async () => {
    try {
      await initializeWorkflowIntegration();
    } catch (error) {
      dialog.showErrorBox("Clackly", error.message);
    }

    paletteWindow = createPaletteWindow();
    registerIpcHandlers();
    registerPaletteHotkey(togglePalette);
  });

  app.on("will-quit", () => {
    const { globalShortcut } = require("electron");
    globalShortcut.unregisterAll();
    cleanupWorkflowIntegration();
  });

  app.on("window-all-closed", () => {});
}
