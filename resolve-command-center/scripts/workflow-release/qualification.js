const fs = require('node:fs');
const path = require('node:path');
const { sha256, assertNormalExistingDirectory } = require('../package-internal-beta');

const DEFAULT_QUALIFICATION = path.join(__dirname, 'vendor-qualification.json');
const SHA256 = /^[a-f0-9]{64}$/;

function readQualification(file = DEFAULT_QUALIFICATION, { publishable = false, archive = false } = {}) {
  const q = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (q.schemaVersion !== 1 || q.publisher !== 'Blackmagic Design'
    || q.source !== 'Blackmagic Design/Workflow Integration/Examples/SamplePlugin'
    || q.samplePath !== 'Examples/SamplePlugin/WorkflowIntegration.node'
    || !SHA256.test(q.native?.sha256) || !Number.isSafeInteger(q.native?.size) || q.native.size < 1) {
    throw new Error('Official vendor qualification identity is invalid');
  }
  if ((publishable || archive) && !SHA256.test(q.sourceArchiveSha256)) {
    throw new Error('Official SDK input blocked: pin the owner-provisioned official-workflow-sdk.zip SHA-256 in vendor-qualification.json');
  }
  if (publishable && (q.redistribution?.status !== 'approved' || !q.redistribution.evidenceRef)) {
    throw new Error('Publication blocked: the once-only official SDK terms review needs clear public redistribution evidence in vendor-qualification.json');
  }
  return q;
}

function verifyOfficialNative(sourceRoot, q) {
  assertNormalExistingDirectory(sourceRoot);
  const file = path.join(sourceRoot, ...q.samplePath.split('/'));
  assertNormalExistingDirectory(path.dirname(file));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== q.native.size
    || sha256(file).toLowerCase() !== q.native.sha256) throw new Error('Official SamplePlugin native bytes do not match the pinned qualification');
  const header = fs.readFileSync(file);
  const offset = header.length >= 64 ? header.readUInt32LE(60) : -1;
  if (header.toString('ascii', 0, 2) !== 'MZ' || offset < 64 || offset + 6 > header.length
    || header.toString('ascii', offset, offset + 4) !== 'PE\0\0' || header.readUInt16LE(offset + 4) !== 0x8664) {
    throw new Error('Official SamplePlugin module must be a Windows x64 PE binary');
  }
  return file;
}
module.exports = { DEFAULT_QUALIFICATION, SHA256, readQualification, verifyOfficialNative };
