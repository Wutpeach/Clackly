import paletteGeometry from "../shared/palette-geometry.json" with { type: "json" };

export const OPAQUE_FULL_BLEED_SURFACE = paletteGeometry.modes.opaqueFullBleed;
export const DETACHED_NATIVE_PANEL_MODE = paletteGeometry.modes.detachedNativePanel;

export function getPaletteShadowPadding({ hasElectronHost, search, shadowPadding }) {
  const paletteSurface = new URLSearchParams(search).get("palette-surface");
  return hasElectronHost && paletteSurface === OPAQUE_FULL_BLEED_SURFACE
    ? 0
    : shadowPadding;
}

export function usesDetachedNativePanel({ hasElectronHost, search }) {
  return hasElectronHost && new URLSearchParams(search).get("interaction-panel-mode") === DETACHED_NATIVE_PANEL_MODE;
}
