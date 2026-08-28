import paletteGeometry from "../shared/palette-geometry.json" with { type: "json" };

export { paletteGeometry };

export function getPaletteVisualStyle(shadowPadding) {
  return {
    "--palette-shadow-padding": `${shadowPadding}px`,
    "--palette-main-width": `${paletteGeometry.main.width}px`,
    "--palette-main-height": `${paletteGeometry.main.height}px`,
    "--palette-main-radius": `${paletteGeometry.main.radius}px`,
    "--palette-surface": paletteGeometry.main.surface,
    "--palette-external-shadow": paletteGeometry.visual.externalShadow,
    "--interaction-panel-gap": `${paletteGeometry.interactionPanel.gap}px`,
    "--interaction-panel-width": `${paletteGeometry.interactionPanel.width}px`,
    "--interaction-panel-min-height": `${paletteGeometry.interactionPanel.minHeight}px`,
    "--interaction-panel-max-height": `${paletteGeometry.interactionPanel.maxHeight}px`,
    "--interaction-panel-inset": `${paletteGeometry.interactionPanel.inset}px`,
    "--interaction-panel-radius": `${paletteGeometry.interactionPanel.radius}px`
  };
}
