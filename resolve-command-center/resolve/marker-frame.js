function parseFrameRate(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error("Could not read the timeline frame rate");
  }

  const text = String(value).trim();
  const match = text.match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
  if (!match) {
    throw new Error(`Unsupported timeline frame rate: ${value}`);
  }

  const numerator = Number(match[1]);
  const denominator = match[2] === undefined ? 1 : Number(match[2]);
  const frameRate = numerator / denominator;

  if (!Number.isFinite(frameRate) || frameRate <= 0 || denominator <= 0) {
    throw new Error(`Unsupported timeline frame rate: ${value}`);
  }

  return frameRate;
}

function timecodeToFrames(timecode, frameRate) {
  const match = String(timecode).trim().match(/^(\d+):(\d+):(\d+)([:;])(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported timeline timecode: ${timecode}`);
  }

  const [, hoursText, minutesText, secondsText, separator, framesText] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  const frames = Number(framesText);
  const nominalRate = Math.round(frameRate);

  if (minutes > 59 || seconds > 59 || frames >= nominalRate) {
    throw new Error(`Invalid timeline timecode: ${timecode}`);
  }

  let totalFrames =
    hours * 3600 * nominalRate +
    minutes * 60 * nominalRate +
    seconds * nominalRate +
    frames;

  if (separator === ";") {
    const dropFrames = Math.round(nominalRate * 0.0666666667);
    const supportsDropFrame =
      (nominalRate === 30 || nominalRate === 60) &&
      Math.abs(frameRate - nominalRate * 1000 / 1001) < 0.01;
    if (!supportsDropFrame) {
      throw new Error(`Unsupported drop-frame rate ${frameRate} for timecode ${timecode}`);
    }

    if (seconds === 0 && minutes % 10 !== 0 && frames < dropFrames) {
      throw new Error(`Invalid drop-frame timeline timecode: ${timecode}`);
    }

    const totalMinutes = hours * 60 + minutes;
    totalFrames -= dropFrames * (totalMinutes - Math.floor(totalMinutes / 10));
  }

  return totalFrames;
}

function timelineRelativeFrame(currentTimecode, startTimecode, frameRate) {
  const frame =
    timecodeToFrames(currentTimecode, frameRate) -
    timecodeToFrames(startTimecode, frameRate);

  if (!Number.isSafeInteger(frame) || frame < 0) {
    throw new Error(
      `Playhead timecode ${currentTimecode} is before timeline start ${startTimecode}`
    );
  }

  return frame;
}

module.exports = {
  parseFrameRate,
  timecodeToFrames,
  timelineRelativeFrame
};
