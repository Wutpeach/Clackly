const path = require("node:path");

const { AfterEffectsLauncher } = require("../capability/afterEffectsLaunch");
const { createCapabilityRegistry } = require("../capability/registry");
const { createMarkerCapability } = require("../capability/marker");
const { createImageClipboardCapability } = require("../capability/imageClipboard");
const { registerScriptCapabilities } = require("../capability/registerScripts");
const { createCommandExecutor } = require("../command-engine/executor");
const { getCommands } = require("../command-engine/registry");
const { CommandSearchService } = require("../command-search/CommandSearchService.mjs");
const { CommandUsageHistory } = require("../command-usage/CommandUsageHistory");
const { CommandUsageStorage } = require("../command-usage/CommandUsageStorage");
const { ConfigManager } = require("../config/ConfigManager");
const { ConfigStorage } = require("../config/ConfigStorage");
const { Preferences } = require("../preferences/Preferences");
const { LocalizationService } = require("../localization/LocalizationService");
const { FeatureCatalog } = require("../feature-ui/FeatureCatalog");
const { FeatureStateStorage } = require("../feature-status/FeatureStateStorage");
const { FeatureStatusManager } = require("../feature-status/FeatureStatusManager");
const { ShortcutManager } = require("../shortcut/ShortcutManager");
const { RuntimeManager } = require("../script-runtime/runtime/manager");
const { resolveRuntimeRoot } = require("../script-runtime/runtime/paths");
const packageMetadata = require("../package.json");

/**
 * Application Composition Root: the single source of truth for wiring the
 * application-level services shared by the Workflow Plugin and standalone
 * Electron hosts. Hosts inject their Resolve access adapters and paths; the
 * Root owns every shared construction and registration.
 */
function createClacklyCore({
  appRoot,
  appDataPath,
  temporaryRoot,
  hostContextProvider,
  systemLanguagesProvider = () => [],
  markerBackends,
  imageClipboard
} = {}) {
  if (typeof appRoot !== "string" || appRoot.trim().length === 0) {
    throw new TypeError("Clackly Core requires an application root");
  }
  if (typeof appDataPath !== "string" || appDataPath.trim().length === 0) {
    throw new TypeError("Clackly Core requires an app data path");
  }
  if (typeof temporaryRoot !== "string" || temporaryRoot.trim().length === 0) {
    throw new TypeError("Clackly Core requires a temporary root");
  }
  if (typeof hostContextProvider !== "function") {
    throw new TypeError("Clackly Core requires a host context provider");
  }
  if (typeof systemLanguagesProvider !== "function") {
    throw new TypeError("Clackly Core requires a system languages provider");
  }
  if (!markerBackends || typeof markerBackends !== "object" || Array.isArray(markerBackends)) {
    throw new TypeError("Clackly Core requires marker backends");
  }
  if (!imageClipboard || typeof imageClipboard !== "object" || Array.isArray(imageClipboard)) {
    throw new TypeError("Clackly Core requires Image Clipboard host adapters");
  }

  const shortcutManager = new ShortcutManager();
  const markerCapability = createMarkerCapability({
    ...markerBackends,
    keyboardShortcut: {
      isAvailable: () => shortcutManager.canExecute("ADD_MARKER"),
      addMarker: (context) => shortcutManager.execute("ADD_MARKER", context)
    }
  });
  const capabilityRegistry = createCapabilityRegistry();
  capabilityRegistry.register("marker.add", markerCapability);
  const imageClipboardCapability = createImageClipboardCapability(imageClipboard);
  capabilityRegistry.register("media.clipboard-image.import", imageClipboardCapability);

  const desktopLauncher = new AfterEffectsLauncher({
    hostEnvironment: process.env,
    temporaryRoot
  });
  const runtimeManager = new RuntimeManager({
    runtimeRoot: resolveRuntimeRoot({
      appRoot
    }),
    cachePath: path.join(appDataPath, "Clackly", "runtime-probe.json"),
    clacklyVersion: packageMetadata.version,
    desktopLauncher,
    hostContextProvider,
    scriptRoot: appRoot,
    ...(process.env.CLACKLY_PYTHON_EXECUTABLE
      ? { overrideExecutable: process.env.CLACKLY_PYTHON_EXECUTABLE }
      : {})
  });
  registerScriptCapabilities({ capabilityRegistry, appRoot, runtimeManager });

  const featureCatalog = new FeatureCatalog({ capabilityRegistry });
  const configManager = new ConfigManager({
    capabilityRegistry,
    storage: ConfigStorage.fromAppData(appDataPath)
  });
  // Preferences deliberately own a separate full-replacement document. ConfigManager
  // remains the only capability-domain authority for config.json.
  const preferences = new Preferences({ appDataPath });
  const localizationService = new LocalizationService({ preferences, systemLanguagesProvider });
  const usageHistory = new CommandUsageHistory({
    storage: CommandUsageStorage.fromAppData(appDataPath)
  });
  const commandSearch = new CommandSearchService({
    getCommands,
    localizationService,
    usageHistory
  });
  const featureStatusManager = new FeatureStatusManager({
    capabilityRegistry,
    configManager,
    stateStorage: FeatureStateStorage.fromAppData(appDataPath)
  });
  const executeCommand = createCommandExecutor({
    capabilityRegistry,
    configManager,
    featureStatusManager,
    usageHistory
  });

  return {
    capabilityRegistry,
    configManager,
    preferences,
    localizationService,
    featureStatusManager,
    featureCatalog,
    searchCommands: (query, pinnedIds) => commandSearch.search(query, pinnedIds),
    executeCommand,
    runtimeManager
  };
}

module.exports = { createClacklyCore };
