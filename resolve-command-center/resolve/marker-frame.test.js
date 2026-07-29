const test = require("node:test");
const assert = require("node:assert/strict");
const { parseFrameRate, timecodeToFrames, timelineRelativeFrame } = require("./marker-frame");

test("converts displayed timecode to a timeline-relative marker frame", () => {
  assert.equal(timelineRelativeFrame("01:00:10:00", "01:00:00:00", 24), 240);
});

test("accounts for dropped frames when converting NTSC timecode", () => {
  const frameRate2997 = parseFrameRate("30000/1001");
  assert.equal(timelineRelativeFrame("01:01:00;02", "01:00:00;00", frameRate2997), 1800);
  assert.equal(timelineRelativeFrame("01:10:00;00", "01:00:00;00", frameRate2997), 17982);

  const frameRate5994 = parseFrameRate("60000/1001");
  assert.equal(timelineRelativeFrame("01:01:00;04", "01:00:00;00", frameRate5994), 3600);
  assert.equal(timelineRelativeFrame("01:10:00;00", "01:00:00;00", frameRate5994), 35964);
});

test("rejects frame labels skipped by drop-frame timecode", () => {
  assert.throws(
    () => timecodeToFrames("01:01:00;00", parseFrameRate("30000/1001")),
    /Invalid drop-frame timeline timecode/
  );
  assert.throws(
    () => timecodeToFrames("01:01:00;03", parseFrameRate("60000/1001")),
    /Invalid drop-frame timeline timecode/
  );
});

test("rejects missing and malformed frame rates", () => {
  assert.throws(() => parseFrameRate(null), /Could not read the timeline frame rate/);
  assert.throws(() => parseFrameRate("30000/0"), /Unsupported timeline frame rate/);
  assert.throws(() => parseFrameRate("30000/1001/2"), /Unsupported timeline frame rate/);
});

test("rejects a playhead before the timeline start", () => {
  assert.throws(
    () => timelineRelativeFrame("00:59:59:23", "01:00:00:00", 24),
    /before timeline start/
  );
});
