import paletteGeometry from "../shared/palette-geometry.json" with { type: "json" };

const BROWSER_PREVIEW_COMMANDS = [
  {
    id: "preview.primary",
    name: "Preview Color Grade",
    description: "Representative command shown only in the browser preview.",
    category: "Preview",
    icon: "palette",
    keywords: ["preview", "color", "grade"],
    capability: "preview.palette",
    presentation: "visible"
  },
  {
    id: "preview.secondary",
    name: "Preview Timeline",
    description: "A second representative command for the browser preview.",
    category: "Preview",
    icon: "search",
    keywords: ["preview", "timeline"],
    capability: "preview.palette",
    presentation: "visible"
  },
  {
    id: "preview.inspect",
    name: "Inspect Preview Details",
    description: "Show representative inspection details.",
    category: "Preview",
    icon: "info",
    keywords: ["preview", "inspect"],
    capability: "preview.palette",
    presentation: "internal"
  },
  {
    id: "preview.adjust",
    name: "Adjust Preview Settings",
    description: "Open representative preview adjustments.",
    category: "Preview",
    icon: "settings",
    keywords: ["preview", "adjust"],
    capability: "preview.palette",
    presentation: "internal"
  }
];

const BROWSER_PREVIEW_BINDINGS = [
  {
    id: "preview.primary.click",
    target: "preview.primary",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "preview.primary" }
  },
  {
    id: "preview.primary.inspect",
    target: "preview.primary",
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
    action: { command: "preview.inspect" }
  },
  {
    id: "preview.primary.adjust",
    target: "preview.primary",
    trigger: { type: "mouse", button: "right", modifiers: ["SHIFT"] },
    action: { command: "preview.adjust" }
  }
];

const BROWSER_PREVIEW_STATUSES = [
  {
    id: "preview.palette",
    installed: true,
    enabled: true,
    status: "ready",
    message: null,
    details: { missing: [], action: null }
  }
];

const PREVIEW_EXECUTION_ERROR = "Browser preview commands cannot execute outside Electron.";
const { inset: PANEL_INSET, minHeight: PANEL_MIN_HEIGHT, maxHeight: PANEL_MAX_HEIGHT } = paletteGeometry.interactionPanel;
const PALETTE_HEIGHT = paletteGeometry.main.height;


function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getPreviewPanelGeometry({ anchorY, contentHeight }) {
  const panelHeight = clamp(Math.round(contentHeight) || PANEL_MIN_HEIGHT, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT);
  const panelTop = clamp(
    Math.round(anchorY) - Math.round(panelHeight / 2),
    PANEL_INSET,
    PALETTE_HEIGHT - PANEL_INSET - panelHeight
  );
  return { panelTop, panelHeight, anchorY: Math.round(anchorY) };
}

/**
 * Browser-only presentation data for Vite's root preview. This is deliberately
 * not imported by command registry, preload, IPC, or Resolve capability code.
 */
export function createBrowserPreviewApi() {
  return {
    listCommands: async () => clone(BROWSER_PREVIEW_COMMANDS),
    listInteractionBindings: async () => clone(BROWSER_PREVIEW_BINDINGS),
    executeCommand: async () => { throw new Error(PREVIEW_EXECUTION_ERROR); },
    executeInteraction: async () => { throw new Error(PREVIEW_EXECUTION_ERROR); },
    listFeatures: async () => [],
    listFeatureStatuses: async () => clone(BROWSER_PREVIEW_STATUSES),
    refreshFeatureStatuses: async () => clone(BROWSER_PREVIEW_STATUSES),
    setFeatureEnabled: async (_featureId, _enabled) => clone(BROWSER_PREVIEW_STATUSES[0]),
    getConfig: async () => ({}),
    saveConfig: async (_capabilityId, values) => clone(values),
    resetConfig: async () => ({}),
    pickPath: async () => null,
    openSettings: () => {},
    closeSettings: () => {},
    hidePalette: () => {},
    openInteractionPanel: async (metrics) => getPreviewPanelGeometry(metrics),
    closeInteractionPanel: () => {},
    onPaletteShown: (callback) => {
      const frame = requestAnimationFrame(callback);
      return () => cancelAnimationFrame(frame);
    },
    onSettingsFeatureSelected: () => () => {}
  };
}
