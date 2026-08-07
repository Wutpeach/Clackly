function composeStartup({
  initializeAfterEffectsPath,
  createPaletteWindow,
  registerIpcHandlers,
  registerPaletteHotkey,
  reportInitializationError,
  handleHotkeyRegistrationFailure = () => {}
}) {
  const aePathInitialization = initializeAfterEffectsPath();
  aePathInitialization.catch(reportInitializationError);
  const paletteWindow = createPaletteWindow();
  registerIpcHandlers();
  const hotkeyRegistered = registerPaletteHotkey();
  if (!hotkeyRegistered) handleHotkeyRegistrationFailure();
  return { aePathInitialization, paletteWindow };
}

module.exports = { composeStartup };
