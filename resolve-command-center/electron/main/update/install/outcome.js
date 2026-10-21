const fs = require('node:fs');
const path = require('node:path');
const TERMINAL = new Set(['installed', 'rolled-back', 'failed', 'cancelled']);
const REASONS = new Set(['publisher-unverified', 'host-unqualified', 'target-unverified', 'permission-denied',
  'permission-cancelled', 'process-unknown', 'host-running', 'concurrent-install', 'recovery-required',
  'native-missing', 'native-invalid', 'native-incompatible', 'invalid-package', 'install-failed', 'unsupported-host']);

function readPointer(cacheRoot, normalPath) {
  const pointerFile = path.join(cacheRoot, 'installation.json');
  normalPath(cacheRoot);
  try { normalPath(pointerFile); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (fs.statSync(pointerFile).size > 65536) throw new Error('recovery-required');
  const record = JSON.parse(fs.readFileSync(pointerFile, 'utf8'));
  if (record.schemaVersion !== 1 || !/^[a-f0-9]{32}$/.test(record.id) || !/^[a-f0-9]{64}$/.test(record.digest) ||
      !Number.isSafeInteger(record.size) || record.size <= 0 || record.size > 1073741824) throw new Error('recovery-required');
  if (typeof record.version !== 'string' || record.version.length > 64 || !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(record.version)) throw new Error('recovery-required');
  // Drop extra keys: external paths never become authority.
  return { schemaVersion: 1, id: record.id, digest: record.digest, size: record.size,
    version: record.version };
}

function projectOutcome(value, id) {
  if (value?.id !== id || !TERMINAL.has(value.status) ||
      value.reason !== null && !REASONS.has(value.reason)) throw new Error('recovery-required');
  return { status: value.status, reason: value.reason };
}
module.exports = { readPointer, projectOutcome };
