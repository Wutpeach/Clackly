import test from "node:test";
import assert from "node:assert/strict";
import {
  D6_OPAQUE_FULL_BLEED_MARKER,
  D7_TWO_WINDOW_MARKER,
  getPaletteShadowPadding,
  usesD7DetachedInteractionPanel
} from "./paletteDiagnostic.mjs";

test("D6 full-bleed inset is accepted only by an injected Electron Palette host", () => {
  assert.equal(getPaletteShadowPadding({
    hasElectronHost: true,
    search: `?palette-diagnostic=${D6_OPAQUE_FULL_BLEED_MARKER}`,
    shadowPadding: 8
  }), 0);
  assert.equal(getPaletteShadowPadding({
    hasElectronHost: false,
    search: `?palette-diagnostic=${D6_OPAQUE_FULL_BLEED_MARKER}`,
    shadowPadding: 8
  }), 8, "the root browser preview retains its shared padded composition");
  assert.equal(getPaletteShadowPadding({
    hasElectronHost: true,
    search: "?view=settings",
    shadowPadding: 8
  }), 8, "Settings has no Palette diagnostic marker");
});

test("D7 detached Panel marker is accepted only by an injected Electron Palette host", () => {
  assert.equal(usesD7DetachedInteractionPanel({
    hasElectronHost: true,
    search: `?palette-diagnostic=${D6_OPAQUE_FULL_BLEED_MARKER}&interaction-panel-diagnostic=${D7_TWO_WINDOW_MARKER}`
  }), true);
  assert.equal(usesD7DetachedInteractionPanel({
    hasElectronHost: false,
    search: `?interaction-panel-diagnostic=${D7_TWO_WINDOW_MARKER}`
  }), false, "browser preview remains on its attached-panel contract");
  assert.equal(usesD7DetachedInteractionPanel({
    hasElectronHost: true,
    search: "?view=settings"
  }), false, "Settings never opts into the detached Panel");
});
