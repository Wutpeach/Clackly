function createRuntimeEnvironment({
  parentEnvironment = process.env,
  temporaryDirectory,
  platform = process.platform
} = {}) {
  if (typeof temporaryDirectory !== "string" || temporaryDirectory.trim().length === 0) {
    throw new TypeError("Runtime environment requires a temporary directory");
  }

  if (platform !== "win32") return { TMPDIR: temporaryDirectory };
  if (!parentEnvironment || typeof parentEnvironment !== "object") {
    throw new TypeError("Windows Runtime environment requires a parent environment");
  }

  const entries = Object.entries(parentEnvironment);
  const find = (name) => entries.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  const systemRoot = find("SystemRoot");
  if (typeof systemRoot !== "string" || systemRoot.trim().length === 0) {
    throw new TypeError("Windows Runtime environment requires SystemRoot");
  }

  const windir = find("WINDIR");
  return {
    SystemRoot: systemRoot,
    WINDIR: typeof windir === "string" && windir.trim().length > 0 ? windir : systemRoot,
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory
  };
}

module.exports = { createRuntimeEnvironment };
