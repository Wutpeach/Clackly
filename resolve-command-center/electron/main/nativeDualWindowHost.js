function createNativeDualWindowHost({
  palettePolicy,
  createPaletteWindow,
  createDetachedInteractionPanelWindow,
  closeDetachedInteractionPanel,
  openDetachedInteractionPanel,
  showPaletteWindow,
  hidePaletteWindow
}) {
  let paletteWindow = null;
  let detachedInteractionPanelWindow = null;

  function getPaletteWindow() {
    return paletteWindow;
  }

  function getInteractionPanelWindow() {
    return detachedInteractionPanelWindow;
  }

  function ensureDetachedInteractionPanelWindow() {
    if (!detachedInteractionPanelWindow || detachedInteractionPanelWindow.isDestroyed()) {
      detachedInteractionPanelWindow = createDetachedInteractionPanelWindow();
      const openedWindow = detachedInteractionPanelWindow;
      openedWindow.once("closed", () => {
        if (detachedInteractionPanelWindow === openedWindow) {
          detachedInteractionPanelWindow = null;
          closeDetachedInteractionPanel(paletteWindow, null);
        }
      });
    }
    return detachedInteractionPanelWindow;
  }

  function closeInteractionPanel({ restoreFocus = false } = {}) {
    return closeDetachedInteractionPanel(paletteWindow, detachedInteractionPanelWindow, { restoreFocus });
  }

  function createWindow() {
    paletteWindow = createPaletteWindow(palettePolicy);
    ensureDetachedInteractionPanelWindow();
    paletteWindow.on("blur", () => {
      closeInteractionPanel();
    });
    return paletteWindow;
  }

  function showPalette() {
    closeInteractionPanel();
    showPaletteWindow(paletteWindow, palettePolicy);
  }

  function hidePalette() {
    closeInteractionPanel();
    hidePaletteWindow(paletteWindow);
  }

  function openInteractionPanel(request) {
    return openDetachedInteractionPanel(
      paletteWindow,
      ensureDetachedInteractionPanelWindow(),
      request
    );
  }

  return {
    getPaletteWindow,
    getInteractionPanelWindow,
    createWindow,
    showPalette,
    hidePalette,
    openInteractionPanel,
    closeInteractionPanel
  };
}

module.exports = { createNativeDualWindowHost };
