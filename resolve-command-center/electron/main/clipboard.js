function createClipboardImageReader({ clipboard } = {}) {
  if (!clipboard || typeof clipboard.readImage !== "function") {
    throw new TypeError("Clipboard image reader requires Electron Clipboard");
  }

  return {
    readPng() {
      const image = clipboard.readImage();
      if (!image || (typeof image.isEmpty === "function" && image.isEmpty())) return null;
      if (typeof image.toPNG !== "function") return null;
      const png = image.toPNG();
      return Buffer.isBuffer(png) && png.length > 0 ? png : null;
    }
  };
}

module.exports = { createClipboardImageReader };
