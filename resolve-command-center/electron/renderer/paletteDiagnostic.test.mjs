import test from "node:test";
import assert from "node:assert/strict";
import {
  DETACHED_NATIVE_PANEL_MODE,
  OPAQUE_FULL_BLEED_SURFACE,
  getPaletteShadowPadding,
  usesDetachedNativePanel
} from "./paletteDiagnostic.mjs";

test("the opaque full-bleed surface is accepted only by an injected Electron Palette host", () => {
  assert.equal(getPaletteShadowPadding({
    hasElectronHost: true,
    search: `?palette-surface=${OPAQUE_FULL_BLEED_SURFACE}`,
    shadowPadding: 8
  }), 0);
  assert.equal(getPaletteShadowPadding({
    hasElectronHost: false,
    search: `?palette-surface=${OPAQUE_FULL_BLEED_SURFACE}`,
    shadowPadding: 8
  }), 8, "the root browser preview retains its shared padded composition");
  assert.equal(getPaletteShadowPadding({
    hasElectronHost: true,
    search: "?view=settings",
    shadowPadding: 8
  }), 8, "Settings has no Palette diagnostic marker");
});

test("the detached native Panel mode is accepted only by an injected Electron Palette host", () => {
  assert.equal(usesDetachedNativePanel({
    hasElectronHost: true,
    search: `?palette-surface=${OPAQUE_FULL_BLEED_SURFACE}&interaction-panel-mode=${DETACHED_NATIVE_PANEL_MODE}`
  }), true);
  assert.equal(usesDetachedNativePanel({
    hasElectronHost: false,
    search: `?interaction-panel-mode=${DETACHED_NATIVE_PANEL_MODE}`
  }), false, "browser preview remains on its attached-panel contract");
  assert.equal(usesDetachedNativePanel({
    hasElectronHost: true,
    search: "?view=settings"
  }), false, "Settings never opts into the detached Panel");
});
