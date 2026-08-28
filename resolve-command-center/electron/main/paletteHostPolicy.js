const paletteGeometry = require("../shared/palette-geometry.json");

const PALETTE_HOST = Object.freeze({
  STANDALONE: "standalone",
  WORKFLOW: "workflow"
});

const PALETTE_SURFACE = Object.freeze({
  OPAQUE_FULL_BLEED: paletteGeometry.modes.opaqueFullBleed
});

const PALETTE_INTERACTION_MODE = Object.freeze({
  DETACHED_NATIVE: paletteGeometry.modes.detachedNativePanel
});

const TRANSPARENT_ATTACHED_POLICY = Object.freeze({
  surface: null,
  interactionPanel: null,
  ignoreFocusedBlur: false
});

const WINDOWS_NATIVE_DUAL_WINDOW_POLICY = Object.freeze({
  surface: PALETTE_SURFACE.OPAQUE_FULL_BLEED,
  interactionPanel: PALETTE_INTERACTION_MODE.DETACHED_NATIVE,
  ignoreFocusedBlur: true
});

function selectPaletteHostPolicy({ host, platform } = {}) {
  const nativeHost = host === PALETTE_HOST.STANDALONE || host === PALETTE_HOST.WORKFLOW;
  return platform === "win32" && nativeHost
    ? WINDOWS_NATIVE_DUAL_WINDOW_POLICY
    : TRANSPARENT_ATTACHED_POLICY;
}

function usesWindowsNativeDualWindow(policy) {
  return policy === WINDOWS_NATIVE_DUAL_WINDOW_POLICY;
}

module.exports = {
  PALETTE_HOST,
  PALETTE_SURFACE,
  PALETTE_INTERACTION_MODE,
  TRANSPARENT_ATTACHED_POLICY,
  WINDOWS_NATIVE_DUAL_WINDOW_POLICY,
  selectPaletteHostPolicy,
  usesWindowsNativeDualWindow
};
