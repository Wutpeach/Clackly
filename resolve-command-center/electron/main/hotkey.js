const { globalShortcut } = require("electron");

const DEFAULT_ACCELERATOR = "CommandOrControl+Space";

function getPaletteAccelerator() {
  return process.env.RESOLVE_COMMAND_CENTER_HOTKEY || DEFAULT_ACCELERATOR;
}

function registerPaletteHotkey(onToggle) {
  const accelerator = getPaletteAccelerator();
  const registered = globalShortcut.register(accelerator, onToggle);

  if (!registered) {
    console.warn(`Failed to register global shortcut: ${accelerator}`);
  }

  return registered;
}

module.exports = {
  getPaletteAccelerator,
  registerPaletteHotkey
};
