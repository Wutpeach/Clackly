import test from "node:test";
import assert from "node:assert/strict";
import paletteGeometry from "../shared/palette-geometry.json" with { type: "json" };
import { getPaletteVisualStyle } from "./paletteVisualStyle.mjs";

test("the renderer visual style is a direct projection of the canonical Palette contract", () => {
  assert.deepEqual(getPaletteVisualStyle(8), {
    "--palette-shadow-padding": "8px",
    "--palette-main-width": "240px",
    "--palette-main-height": "320px",
    "--palette-main-radius": "8px",
    "--palette-surface": "#151619",
    "--palette-external-shadow": "0 2px 6px rgba(0, 0, 0, 0.45)",
    "--interaction-panel-gap": "16px",
    "--interaction-panel-width": "260px",
    "--interaction-panel-min-height": "60px",
    "--interaction-panel-max-height": "180px",
    "--interaction-panel-inset": "8px",
    "--interaction-panel-radius": "4px"
  });
  assert.equal(getPaletteVisualStyle(0)["--palette-shadow-padding"], "0px");
  assert.equal(paletteGeometry.main.surface, getPaletteVisualStyle(0)["--palette-surface"]);
});
