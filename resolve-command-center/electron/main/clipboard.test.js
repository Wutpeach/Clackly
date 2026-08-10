const assert = require("node:assert/strict");
const test = require("node:test");

const { createClipboardImageReader } = require("./clipboard");

test("Electron Clipboard adapter returns PNG bytes without leaking NativeImage", () => {
  const png = Buffer.from("png");
  const reader = createClipboardImageReader({
    clipboard: {
      readImage: () => ({ isEmpty: () => false, toPNG: () => png })
    }
  });
  assert.equal(reader.readPng(), png);
});

test("Electron Clipboard adapter normalizes empty images", () => {
  const reader = createClipboardImageReader({
    clipboard: {
      readImage: () => ({ isEmpty: () => true, toPNG: () => Buffer.from("unused") })
    }
  });
  assert.equal(reader.readPng(), null);
});
