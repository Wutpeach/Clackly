export const D6_OPAQUE_FULL_BLEED_MARKER = "d6-opaque-full-bleed";
export const D7_TWO_WINDOW_MARKER = "d7-two-window";

export function getPaletteShadowPadding({ hasElectronHost, search, shadowPadding }) {
  const paletteDiagnostic = new URLSearchParams(search).get("palette-diagnostic");
  return hasElectronHost && paletteDiagnostic === D6_OPAQUE_FULL_BLEED_MARKER
    ? 0
    : shadowPadding;
}

export function usesD7DetachedInteractionPanel({ hasElectronHost, search }) {
  return hasElectronHost && new URLSearchParams(search).get("interaction-panel-diagnostic") === D7_TWO_WINDOW_MARKER;
}
