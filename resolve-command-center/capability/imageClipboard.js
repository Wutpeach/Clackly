const fs = require("node:fs/promises");
const path = require("node:path");

const CAPABILITY_ID = "media.clipboard-image.import";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function featureError(code, message, details = {}, cause) {
  const error = Object.assign(new Error(message), { code, details });
  if (cause !== undefined) error.cause = cause;
  return error;
}

function sanitizePathSegment(value, fallback = "Untitled Project") {
  let segment = typeof value === "string" ? value.trim() : "";
  segment = segment
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[ .]+$/g, "")
    .slice(0, 120);
  if (!segment || segment === "." || segment === "..") segment = fallback;
  if (WINDOWS_RESERVED_NAME.test(segment)) segment = `_${segment}`;
  return segment;
}

function isWithinRoot(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!path.isAbsolute(relative)
    && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function getImageClipboardDefaults(picturesPath) {
  if (typeof picturesPath !== "string" || !picturesPath.trim()) {
    throw new TypeError("Image Clipboard requires the host Pictures path");
  }
  return Object.freeze({
    saveRoot: path.join(picturesPath, "Clackly Clipboard"),
    binName: "Clipboard",
    organizeByProject: true
  });
}

function timestamp(date) {
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    pad(date.getMilliseconds(), 3)
  ].join("_");
}

async function persistPng({ png, projectName, settings, fileSystem, now }) {
  const root = path.resolve(settings.saveRoot);
  const directory = settings.organizeByProject
    ? path.resolve(root, sanitizePathSegment(projectName))
    : root;
  if (!isWithinRoot(root, directory)) {
    throw featureError("clipboard-image-path-unsafe", "Clipboard image path escapes the save root", {
      saveRoot: root
    });
  }

  try {
    await fileSystem.mkdir(directory, { recursive: true });
  } catch (error) {
    throw featureError("clipboard-image-save-failed", "Could not create the Clipboard image folder", {
      directory,
      cause: error?.message || String(error)
    }, error);
  }

  const baseName = `Clipboard_${timestamp(now())}`;
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const fileName = `${baseName}${suffix ? `_${suffix}` : ""}.png`;
    const diskPath = path.resolve(directory, fileName);
    if (!isWithinRoot(root, diskPath)) {
      throw featureError("clipboard-image-path-unsafe", "Clipboard image path escapes the save root", {
        saveRoot: root
      });
    }
    try {
      await fileSystem.writeFile(diskPath, png, { flag: "wx" });
      return diskPath;
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw featureError("clipboard-image-save-failed", "Could not save the Clipboard image", {
        diskPath,
        cause: error?.message || String(error)
      }, error);
    }
  }
  throw featureError("clipboard-image-save-failed", "Could not allocate a unique Clipboard image filename", {
    directory
  });
}

function createImageClipboardCapability({
  clipboard,
  resolveMediaPool,
  picturesPath,
  fileSystem = fs,
  now = () => new Date(),
  settings = getImageClipboardDefaults(picturesPath)
} = {}) {
  if (!clipboard || typeof clipboard.readPng !== "function") {
    throw new TypeError("Image Clipboard requires a host Clipboard adapter");
  }
  if (!resolveMediaPool || typeof resolveMediaPool.getCurrentProjectName !== "function"
    || typeof resolveMediaPool.importMediaToBin !== "function") {
    throw new TypeError("Image Clipboard requires a Resolve Media Pool adapter");
  }
  if (!fileSystem || typeof fileSystem.mkdir !== "function"
    || typeof fileSystem.writeFile !== "function" || typeof now !== "function") {
    throw new TypeError("Image Clipboard requires filesystem and clock adapters");
  }
  if (!settings || typeof settings.saveRoot !== "string" || !settings.saveRoot.trim()
    || typeof settings.binName !== "string" || !settings.binName.trim()
    || typeof settings.organizeByProject !== "boolean") {
    throw new TypeError("Image Clipboard settings are invalid");
  }

  async function execute() {
    let png;
    try {
      png = await clipboard.readPng();
    } catch (error) {
      throw featureError("clipboard-image-read-failed", "Could not read the system Clipboard image", {
        cause: error?.message || String(error)
      }, error);
    }
    if (!Buffer.isBuffer(png) || png.length <= PNG_SIGNATURE.length
      || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw featureError("clipboard-image-not-found", "The Clipboard does not contain an image");
    }

    let projectName;
    try {
      const rawName = await resolveMediaPool.getCurrentProjectName();
      projectName = typeof rawName === "string" && rawName.trim()
        ? rawName.trim()
        : "Untitled Project";
    } catch (error) {
      if (typeof error?.code === "string") throw error;
      throw featureError("resolve-project-unavailable", "No current Resolve project is available", {
        cause: error?.message || String(error)
      }, error);
    }

    const diskPath = await persistPng({
      png,
      projectName,
      settings,
      fileSystem,
      now
    });

    let imported;
    try {
      imported = await resolveMediaPool.importMediaToBin({
        diskPath,
        binName: settings.binName
      });
    } catch (error) {
      if (typeof error?.code === "string") {
        error.details = { ...(error.details || {}), diskPath };
        throw error;
      }
      throw featureError("media-pool-import-failed", "Resolve could not import the Clipboard image", {
        diskPath,
        cause: error?.message || String(error)
      }, error);
    }

    return {
      diskPath,
      mediaPoolBin: imported?.mediaPoolBin || settings.binName,
      projectName,
      ...(Array.isArray(imported?.warnings) && imported.warnings.length > 0
        ? { warnings: imported.warnings }
        : {})
    };
  }

  async function checkAvailability() {
    const available = typeof resolveMediaPool.isAvailable !== "function"
      || await resolveMediaPool.isAvailable();
    return available
      ? { status: "ready", message: null, details: { missing: [], action: null } }
      : {
          status: "unavailable",
          message: "Resolve is unavailable.",
          details: { missing: [], action: null }
        };
  }

  return {
    metadata: {
      id: CAPABILITY_ID,
      name: "Paste Clipboard Image",
      description: "Save the Clipboard image and import it into Resolve",
      category: "Media",
      icon: "image",
      version: "1.0.0",
      type: "command",
      providers: ["electron-host", "resolve-api"],
      configSchema: {}
    },
    execute,
    checkAvailability
  };
}

module.exports = {
  CAPABILITY_ID,
  PNG_SIGNATURE,
  createImageClipboardCapability,
  getImageClipboardDefaults,
  isWithinRoot,
  sanitizePathSegment
};
