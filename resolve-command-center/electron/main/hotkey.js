const { globalShortcut } = require("electron");

const DEFAULT_ACCELERATOR = "CommandOrControl+Space";

function registerPaletteHotkey(onToggle) {
  const accelerator = process.env.RESOLVE_COMMAND_CENTER_HOTKEY || DEFAULT_ACCELERATOR;
  const registered = globalShortcut.register(accelerator, onToggle);

  if (!registered) {
    console.warn(`Failed to register global shortcut: ${accelerator}`);
  }

  return registered;
}

module.exports = {
  registerPaletteHotkey
};
