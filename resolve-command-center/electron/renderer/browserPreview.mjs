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
    presentation: "visible",
    localizations: { "zh-CN": { name: "预览调色", description: "仅在浏览器预览中显示的示例命令。", category: "预览", keywords: ["预览", "调色"] } }
  },
  {
    id: "preview.secondary",
    name: "Preview Timeline",
    description: "A second representative command for the browser preview.",
    category: "Preview",
    icon: "search",
    keywords: ["preview", "timeline"],
    capability: "preview.palette",
    presentation: "visible",
    localizations: { "zh-CN": { name: "预览时间线", description: "浏览器预览中的第二个示例命令。", category: "预览", keywords: ["预览", "时间线"] } }
  },
  {
    id: "preview.inspect",
    name: "Inspect Preview Details",
    description: "Show representative inspection details.",
    category: "Preview",
    icon: "info",
    keywords: ["preview", "inspect"],
    capability: "preview.palette",
    presentation: "internal",
    localizations: { "zh-CN": { name: "检查预览详情", description: "显示示例检查详情。", category: "预览", keywords: ["预览", "检查"] } }
  },
  {
    id: "preview.adjust",
    name: "Adjust Preview Settings",
    description: "Open representative preview adjustments.",
    category: "Preview",
    icon: "settings",
    keywords: ["preview", "adjust"],
    capability: "preview.palette",
    presentation: "internal",
    localizations: { "zh-CN": { name: "调整预览设置", description: "打开示例预览调整。", category: "预览", keywords: ["预览", "调整"] } }
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

export const SETTINGS_PREVIEW_SCENARIOS = Object.freeze([
  "general-empty",
  "typical-ready",
  "missing-config-long-path",
  "zh-cn-multi-help",
  "busy",
  "error"
]);

const SETTINGS_PREVIEW_FEATURES = [
  {
    id: "settings-preview.export",
    capability: "settings-preview.export",
    name: "Export to After Effects",
    description: "Send the selected Resolve timeline range to After Effects using the configured executable and output folder.",
    category: "Workflow",
    icon: "send",
    keywords: ["after effects", "export", "workflow"],
    configSchema: {
      afterEffectsPath: {
        type: "path",
        label: "After Effects executable",
        required: true,
        localizations: { "zh-CN": { label: "After Effects 可执行文件" } }
      },
      outputFolder: {
        type: "folder",
        label: "Output folder",
        required: true,
        localizations: { "zh-CN": { label: "输出文件夹" } }
      },
      importMode: {
        type: "select",
        label: "Import mode",
        required: true,
        options: ["replace", "new-composition"],
        optionLabels: { replace: "Replace active composition", "new-composition": "Create a new composition" },
        localizations: {
          "zh-CN": {
            label: "导入方式",
            optionLabels: { replace: "替换当前合成", "new-composition": "创建新合成" }
          }
        }
      },
      includeAudio: {
        type: "boolean",
        label: "Include audio",
        localizations: { "zh-CN": { label: "包含音频" } }
      }
    },
    localizations: {
      "zh-CN": {
        name: "导出到 After Effects",
        description: "使用已配置的可执行文件和输出文件夹，将 Resolve 时间线选区发送到 After Effects。",
        category: "工作流程",
        keywords: ["After Effects", "导出", "工作流程"]
      }
    }
  },
  {
    id: "settings-preview.clipboard",
    capability: "settings-preview.clipboard",
    name: "Paste Clipboard Image",
    description: "Save a clipboard image and import it into the Resolve Media Pool.",
    category: "Media",
    icon: "image",
    keywords: ["clipboard", "image", "media"],
    configSchema: {},
    localizations: {
      "zh-CN": {
        name: "粘贴剪贴板图像",
        description: "保存剪贴板图像并导入 Resolve 媒体池。",
        category: "媒体",
        keywords: ["剪贴板", "图像", "媒体"]
      }
    }
  },
  {
    id: "settings-preview.marker",
    capability: "settings-preview.marker",
    name: "Add Timeline Marker",
    description: "Add a marker at the current Resolve timeline position.",
    category: "Timeline",
    icon: "marker",
    keywords: ["marker", "timeline"],
    configSchema: {},
    localizations: {
      "zh-CN": {
        name: "添加时间线标记",
        description: "在当前 Resolve 时间线位置添加标记。",
        category: "时间线",
        keywords: ["标记", "时间线"]
      }
    }
  }
];

const SETTINGS_PREVIEW_COMMANDS = [
  {
    id: "settings-preview.export",
    name: "Export to After Effects",
    description: "Send the selected Resolve timeline range to After Effects.",
    category: "Workflow",
    icon: "send",
    keywords: ["after effects", "export"],
    capability: "settings-preview.export",
    presentation: "visible",
    localizations: { "zh-CN": { name: "导出到 After Effects", description: "将 Resolve 时间线选区发送到 After Effects。", category: "工作流程", keywords: ["After Effects", "导出"] } }
  },
  {
    id: "settings-preview.export.audio",
    name: "Export Audio to After Effects",
    description: "Send timeline audio to After Effects.",
    category: "Workflow",
    icon: "audio",
    keywords: ["audio", "export"],
    capability: "settings-preview.export",
    presentation: "internal",
    localizations: { "zh-CN": { name: "导出音频到 After Effects", description: "将时间线音频发送到 After Effects。", category: "工作流程", keywords: ["音频", "导出"] } }
  },
  {
    id: "settings-preview.export.video",
    name: "Export Video to After Effects",
    description: "Send timeline video to After Effects.",
    category: "Workflow",
    icon: "video",
    keywords: ["video", "export"],
    capability: "settings-preview.export",
    presentation: "internal",
    localizations: { "zh-CN": { name: "导出视频到 After Effects", description: "将时间线视频发送到 After Effects。", category: "工作流程", keywords: ["视频", "导出"] } }
  }
];

const SETTINGS_PREVIEW_BINDINGS = [
  {
    id: "settings-preview.export.click",
    target: "settings-preview.export",
    trigger: { type: "mouse", button: "left", modifiers: [] },
    action: { command: "settings-preview.export" }
  },
  {
    id: "settings-preview.export.audio",
    target: "settings-preview.export",
    trigger: { type: "mouse", button: "left", modifiers: ["CTRL"] },
    action: { command: "settings-preview.export.audio" }
  },
  {
    id: "settings-preview.export.video",
    target: "settings-preview.export",
    trigger: { type: "mouse", button: "right", modifiers: ["CTRL", "SHIFT"] },
    action: { command: "settings-preview.export.video" }
  }
];

function settingsPreviewStatus(id, overrides = {}) {
  return {
    id,
    installed: true,
    enabled: true,
    status: "ready",
    message: null,
    details: { missing: [], action: null },
    ...overrides
  };
}

const LONG_WINDOWS_AFTER_EFFECTS_PATH = "C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\Support\\Developer\\Workflow Integrations\\Clackly\\After Effects 2025\\AfterFX.exe";

const SETTINGS_PREVIEW_FIXTURES = Object.freeze({
  "general-empty": {
    selectedId: "general",
    features: [],
    statuses: [],
    commands: [],
    bindings: [],
    configs: {}
  },
  "typical-ready": {
    selectedId: "settings-preview.export",
    features: SETTINGS_PREVIEW_FEATURES,
    statuses: SETTINGS_PREVIEW_FEATURES.map((feature) => settingsPreviewStatus(feature.capability)),
    commands: SETTINGS_PREVIEW_COMMANDS,
    bindings: SETTINGS_PREVIEW_BINDINGS,
    configs: {
      "settings-preview.export": {
        afterEffectsPath: "C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe",
        outputFolder: "D:\\Resolve Exports",
        importMode: "new-composition",
        includeAudio: true
      }
    }
  },
  "missing-config-long-path": {
    selectedId: "settings-preview.export",
    features: [SETTINGS_PREVIEW_FEATURES[0]],
    statuses: [settingsPreviewStatus("settings-preview.export", {
      status: "missing-config",
      details: { missing: ["Output folder"], action: "open-settings" }
    })],
    commands: SETTINGS_PREVIEW_COMMANDS,
    bindings: SETTINGS_PREVIEW_BINDINGS,
    configs: {
      "settings-preview.export": {
        afterEffectsPath: LONG_WINDOWS_AFTER_EFFECTS_PATH,
        outputFolder: "",
        importMode: "replace",
        includeAudio: false
      }
    }
  },
  "zh-cn-multi-help": {
    locale: "zh-CN",
    selectedId: "settings-preview.export",
    features: [SETTINGS_PREVIEW_FEATURES[0]],
    statuses: [settingsPreviewStatus("settings-preview.export")],
    commands: SETTINGS_PREVIEW_COMMANDS,
    bindings: SETTINGS_PREVIEW_BINDINGS,
    configs: {
      "settings-preview.export": {
        afterEffectsPath: "C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe",
        outputFolder: "D:\\Resolve 导出",
        importMode: "new-composition",
        includeAudio: true
      }
    }
  },
  busy: {
    selectedId: "settings-preview.export",
    pendingConfig: true,
    features: [SETTINGS_PREVIEW_FEATURES[0]],
    statuses: [settingsPreviewStatus("settings-preview.export")],
    commands: SETTINGS_PREVIEW_COMMANDS,
    bindings: SETTINGS_PREVIEW_BINDINGS,
    configs: {}
  },
  error: {
    selectedId: "settings-preview.export",
    saveError: "Settings preview save failed",
    features: [SETTINGS_PREVIEW_FEATURES[0]],
    statuses: [settingsPreviewStatus("settings-preview.export")],
    commands: SETTINGS_PREVIEW_COMMANDS,
    bindings: SETTINGS_PREVIEW_BINDINGS,
    configs: {
      "settings-preview.export": {
        afterEffectsPath: "C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe",
        outputFolder: "D:\\Resolve Exports",
        importMode: "replace",
        includeAudio: true
      }
    }
  }
});

const PREVIEW_EXECUTION_ERROR = "Browser preview commands cannot execute outside Electron.";
const { inset: PANEL_INSET, minHeight: PANEL_MIN_HEIGHT, maxHeight: PANEL_MAX_HEIGHT } = paletteGeometry.interactionPanel;
const PALETTE_HEIGHT = paletteGeometry.main.height;

export function shouldRenderBrowserPreviewAgentation({ hasElectronHost, pathname, search }) {
  return !hasElectronHost && pathname === "/" && search === "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function readBrowserSearch(search) {
  if (typeof search === "string") return search;
  return typeof window === "undefined" ? "" : window.location.search;
}

export function getBrowserSettingsFixture(search) {
  const parameters = new URLSearchParams(readBrowserSearch(search));
  if (parameters.get("view") !== "settings") return null;
  const scenario = parameters.get("settings-preview");
  return SETTINGS_PREVIEW_FIXTURES[scenario] ? clone(SETTINGS_PREVIEW_FIXTURES[scenario]) : null;
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
export function createBrowserPreviewApi({ search } = {}) {
  const browserSearch = readBrowserSearch(search);
  const fixture = getBrowserSettingsFixture(browserSearch);
  const requestedLocale = new URLSearchParams(browserSearch).get("locale");
  let preference = ["system", "en", "zh-CN"].includes(requestedLocale)
    ? requestedLocale
    : fixture?.locale || "en";
  const listeners = new Set();
  let fixtureStatuses = fixture ? clone(fixture.statuses) : null;
  let fixtureConfigs = fixture ? clone(fixture.configs) : null;
  const resolveEffectiveLocale = () => {
    const languages = typeof navigator === "undefined"
      ? []
      : (Array.isArray(navigator.languages) ? navigator.languages : [navigator.language]);
    if (preference === "en" || preference === "zh-CN") return preference;
    return languages.some((language) => /^(zh-cn|zh-sg)|(?:^|-)hans(?:-|$)/i.test(language || "")) ? "zh-CN" : "en";
  };
  const getSnapshot = () => ({ preference, effectiveLocale: resolveEffectiveLocale() });
  return {
    getLocalizationSnapshot: async () => getSnapshot(),
    setLocalePreference: async (locale) => {
      if (!["system", "en", "zh-CN"].includes(locale)) throw new TypeError("Invalid locale preference");
      preference = locale;
      const snapshot = getSnapshot();
      listeners.forEach((listener) => listener(snapshot));
      return snapshot;
    },
    listCommands: async () => clone(fixture?.commands || BROWSER_PREVIEW_COMMANDS),
    listInteractionBindings: async () => clone(fixture?.bindings || BROWSER_PREVIEW_BINDINGS),
    executeCommand: async () => { throw new Error(PREVIEW_EXECUTION_ERROR); },
    executeInteraction: async () => { throw new Error(PREVIEW_EXECUTION_ERROR); },
    listFeatures: async () => clone(fixture?.features || []),
    listFeatureStatuses: async () => clone(fixtureStatuses || BROWSER_PREVIEW_STATUSES),
    refreshFeatureStatuses: async () => clone(fixtureStatuses || BROWSER_PREVIEW_STATUSES),
    setFeatureEnabled: async (featureId, enabled) => {
      if (!fixtureStatuses) return clone(BROWSER_PREVIEW_STATUSES[0]);
      fixtureStatuses = fixtureStatuses.map((status) => status.id === featureId ? { ...status, enabled } : status);
      return clone(fixtureStatuses.find((status) => status.id === featureId) || fixtureStatuses[0]);
    },
    getConfig: async (capabilityId) => {
      if (fixture?.pendingConfig) return new Promise(() => {});
      return clone(fixtureConfigs?.[capabilityId] || {});
    },
    saveConfig: async (capabilityId, values) => {
      if (fixture?.saveError) throw new Error(fixture.saveError);
      if (fixtureConfigs) fixtureConfigs[capabilityId] = clone(values);
      return clone(values);
    },
    resetConfig: async (capabilityId) => clone(fixtureConfigs?.[capabilityId] || {}),
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
    onLocalizationChanged: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    onSettingsFeatureSelected: (callback) => {
      if (!fixture?.selectedId || typeof callback !== "function") return () => {};
      const frame = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => callback(fixture.selectedId))
        : setTimeout(() => callback(fixture.selectedId), 0);
      return () => {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
        else clearTimeout(frame);
      };
    }
  };
}
