const { parseFrameRate, timelineRelativeFrame } = require("./marker-frame");

const MARKER_COLOR = "Red";
const MARKER_NAME = "Clackly Marker";
const MARKER_NOTE = "Added from Clackly";
const MARKER_DURATION = 1;
const MARKER_CUSTOM_DATA = "clackly";

async function callOptional(target, methodName, ...args) {
  const method = target && target[methodName];
  if (typeof method !== "function") {
    return null;
  }

  try {
    return await Promise.resolve(method.apply(target, args));
  } catch (_error) {
    return null;
  }
}

async function callRequired(target, methodName, errorMessage, ...args) {
  const method = target && target[methodName];
  if (typeof method !== "function") {
    throw new Error(errorMessage);
  }

  const value = await Promise.resolve(method.apply(target, args));
  if (value === null || value === undefined || value === false) {
    throw new Error(errorMessage);
  }

  return value;
}

async function getProjectAndTimeline(getResolve) {
  const resolve = await getResolve();
  const projectManager = await callRequired(
    resolve,
    "GetProjectManager",
    "Resolve project manager is unavailable"
  );
  const project = await callRequired(
    projectManager,
    "GetCurrentProject",
    "No current Resolve project"
  );
  const timeline = await callRequired(
    project,
    "GetCurrentTimeline",
    "No current timeline"
  );

  return { project, timeline };
}

function resolveMediaPoolError(code, message, details = {}, cause) {
  const error = Object.assign(new Error(message), { code, details });
  if (cause !== undefined) error.cause = cause;
  return error;
}

async function getCurrentProject(getResolve) {
  let resolve;
  try {
    resolve = await getResolve();
  } catch (error) {
    throw resolveMediaPoolError("resolve-unavailable", "Resolve is unavailable", {
      cause: error?.message || String(error)
    }, error);
  }
  const projectManager = await callRequired(
    resolve,
    "GetProjectManager",
    "Resolve project manager is unavailable"
  ).catch((error) => {
    throw resolveMediaPoolError("resolve-project-unavailable", error.message, {}, error);
  });
  return callRequired(
    projectManager,
    "GetCurrentProject",
    "No current Resolve project"
  ).catch((error) => {
    throw resolveMediaPoolError("resolve-project-unavailable", error.message, {}, error);
  });
}

function folderValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

async function getCurrentProjectName(getResolve) {
  const project = await getCurrentProject(getResolve);
  return (await callOptional(project, "GetName")) || "Untitled Project";
}

async function importMediaToBin(getResolve, { diskPath, binName }, logger = console) {
  const project = await getCurrentProject(getResolve);
  const mediaPool = await callRequired(
    project,
    "GetMediaPool",
    "Current Resolve project has no Media Pool"
  ).catch((error) => {
    throw resolveMediaPoolError("resolve-media-pool-unavailable", error.message, { diskPath }, error);
  });
  const root = await callRequired(
    mediaPool,
    "GetRootFolder",
    "Resolve Media Pool root is unavailable"
  ).catch((error) => {
    throw resolveMediaPoolError("resolve-media-pool-unavailable", error.message, { diskPath }, error);
  });
  const originalFolder = await callRequired(
    mediaPool,
    "GetCurrentFolder",
    "Resolve Media Pool current folder is unavailable"
  ).catch((error) => {
    throw resolveMediaPoolError("resolve-media-pool-unavailable", error.message, { diskPath }, error);
  });

  let folders;
  try {
    folders = folderValues(await callRequired(
      root,
      "GetSubFolderList",
      "Resolve Media Pool folders are unavailable"
    ));
  } catch (error) {
    throw resolveMediaPoolError("resolve-media-pool-unavailable", error.message, { diskPath }, error);
  }
  let targetFolder = null;
  for (const folder of folders) {
    let folderName;
    try {
      folderName = await callRequired(folder, "GetName", "Resolve Media Pool folder name is unavailable");
    } catch (error) {
      throw resolveMediaPoolError("resolve-media-pool-unavailable", error.message, { diskPath }, error);
    }
    if (folderName === binName) {
      targetFolder = folder;
      break;
    }
  }
  if (!targetFolder) {
    try {
      targetFolder = await callRequired(
        mediaPool,
        "AddSubFolder",
        `Resolve could not create the ${binName} Media Pool bin`,
        root,
        binName
      );
    } catch (error) {
      throw resolveMediaPoolError("media-pool-bin-create-failed", error.message, {
        diskPath,
        binName
      }, error);
    }
  }

  let primaryError = null;
  let switchAttempted = false;
  let imported = false;
  let restoreWarning = null;
  const shouldSwitch = originalFolder !== targetFolder;
  try {
    if (shouldSwitch) {
      switchAttempted = true;
      try {
        await callRequired(
          mediaPool,
          "SetCurrentFolder",
          `Resolve could not open the ${binName} Media Pool bin`,
          targetFolder
        );
      } catch (error) {
        throw resolveMediaPoolError("media-pool-bin-open-failed", error.message, {
          diskPath,
          binName
        }, error);
      }
    }
    const importMethod = mediaPool && mediaPool.ImportMedia;
    if (typeof importMethod !== "function") {
      throw new Error("Resolve Media Pool does not support ImportMedia");
    }
    const items = await Promise.resolve(importMethod.call(mediaPool, [diskPath]));
    if (!items || (Array.isArray(items) && items.length === 0)) {
      throw new Error("Resolve ImportMedia returned no imported items");
    }
    imported = true;
  } catch (error) {
    primaryError = error?.code === "media-pool-bin-open-failed"
      ? error
      : resolveMediaPoolError("media-pool-import-failed", "Resolve could not import the Clipboard image", {
          diskPath,
          binName,
          cause: error?.message || String(error)
        }, error);
  } finally {
    if (shouldSwitch && switchAttempted) {
      try {
        await callRequired(
          mediaPool,
          "SetCurrentFolder",
          "Resolve could not restore the previous Media Pool folder",
          originalFolder
        );
      } catch (error) {
        restoreWarning = {
          code: "media-pool-folder-restore-failed",
          message: "Resolve could not restore the previous Media Pool folder"
        };
        logger.warn(`${restoreWarning.message}: ${error.message}`);
      }
    }
  }

  if (primaryError) {
    if (restoreWarning) primaryError.details.warning = restoreWarning;
    throw primaryError;
  }
  return {
    mediaPoolBin: binName,
    imported,
    ...(restoreWarning ? { warnings: [restoreWarning] } : {})
  };
}

async function currentTimelineFrame(project, timeline) {
  const currentTimecode = await callRequired(
    timeline,
    "GetCurrentTimecode",
    "Could not read the current playhead timecode"
  );
  const frameRate = parseFrameRate(
    (await callOptional(timeline, "GetSetting", "timelineFrameRate")) ||
      (await callOptional(project, "GetSetting", "timelineFrameRate"))
  );
  const startTimecode = await callRequired(
    timeline,
    "GetStartTimecode",
    "Could not read the timeline start timecode"
  );
  const startFrame = await callOptional(timeline, "GetStartFrame");
  const endFrame = await callOptional(timeline, "GetEndFrame");
  const frame = timelineRelativeFrame(currentTimecode, startTimecode, frameRate);

  if (startFrame !== null && endFrame !== null) {
    const lastTimelineFrame = Number(endFrame) - Number(startFrame);
    if (Number.isFinite(lastTimelineFrame) && frame > lastTimelineFrame) {
      throw new Error(
        `Playhead ${currentTimecode} resolves to timeline-relative frame ${frame}, ` +
        `outside the timeline range 0-${lastTimelineFrame}`
      );
    }
  }

  return { frame, currentTimecode };
}

async function addMarker(getResolve) {
  const { project, timeline } = await getProjectAndTimeline(getResolve);
  const { frame, currentTimecode } = await currentTimelineFrame(project, timeline);
  const addMarkerMethod = timeline && timeline.AddMarker;
  if (typeof addMarkerMethod !== "function") {
    throw new Error("Current timeline does not support markers");
  }

  let added;
  try {
    added = await Promise.resolve(addMarkerMethod.call(
      timeline,
      frame,
      MARKER_COLOR,
      MARKER_NAME,
      MARKER_NOTE,
      MARKER_DURATION,
      MARKER_CUSTOM_DATA
    ));
  } catch (error) {
    throw new Error(
      `Resolve failed to add a marker at ${currentTimecode} ` +
      `(timeline-relative frame ${frame}): ${error.message}`
    );
  }

  if (!added) {
    const markers = await callOptional(timeline, "GetMarkers");
    const markerAlreadyExists = markers && Object.keys(markers).some(
      markerFrame => Number(markerFrame) === frame
    );
    if (markerAlreadyExists) {
      throw new Error(
        `A timeline marker already exists at ${currentTimecode} ` +
        `(timeline-relative frame ${frame})`
      );
    }

    throw new Error(
      `Resolve refused to add a marker at ${currentTimecode} ` +
      `(timeline-relative frame ${frame}); ensure the playhead is inside the timeline`
    );
  }

  return { ok: true, frame };
}

function createResolveAdapter({ getResolve, logger = console }) {
  if (typeof getResolve !== "function") {
    throw new TypeError("Resolve adapter requires a getResolve function");
  }

  return {
    addMarker: () => addMarker(getResolve),
    isAvailable: async () => {
      try {
        return Boolean(await getResolve());
      } catch (_error) {
        return false;
      }
    },
    getCurrentProjectName: () => getCurrentProjectName(getResolve),
    importMediaToBin: (options) => importMediaToBin(getResolve, options, logger)
  };
}

module.exports = {
  createResolveAdapter,
  currentTimelineFrame,
  folderValues,
  importMediaToBin
};
