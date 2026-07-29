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

function createResolveAdapter({ getResolve }) {
  if (typeof getResolve !== "function") {
    throw new TypeError("Resolve adapter requires a getResolve function");
  }

  return {
    addMarker: () => addMarker(getResolve)
  };
}

module.exports = {
  createResolveAdapter,
  currentTimelineFrame
};
