const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("resolveCommandCenter", {
  listCommands: () => ipcRenderer.invoke("commands:list"),
  searchCommands: (query) => ipcRenderer.invoke("commands:search", query),
  executeCommand: (commandId) => ipcRenderer.invoke("commands:execute", commandId),
  executeInteraction: (event) => ipcRenderer.invoke("interactions:execute", event),
  setPaletteMode: (mode) => ipcRenderer.send("palette:set-mode", mode),
  hidePalette: () => ipcRenderer.send("palette:hide"),
  onPaletteShown: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("palette:shown", listener);
    return () => ipcRenderer.removeListener("palette:shown", listener);
  }
});
