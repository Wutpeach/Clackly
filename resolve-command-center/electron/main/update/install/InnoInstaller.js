const fs = require('node:fs');
const crypto = require('node:crypto');
const { failure } = require('../identity');

// The official Release digest is the trust source; this only rejects non-EXE bytes.
async function verifyExecutable(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const header = Buffer.alloc(64);
    if ((await handle.read(header, 0, 64, 0)).bytesRead !== 64 || header.toString('ascii', 0, 2) !== 'MZ') throw failure('invalid-exe');
    const offset = header.readUInt32LE(60);
    const pe = Buffer.alloc(6);
    if (offset < 64 || (await handle.read(pe, 0, 6, offset)).bytesRead !== 6 || pe.readUInt32LE(0) !== 0x4550
      || ![0x14c, 0x8664].includes(pe.readUInt16LE(4))) throw failure('invalid-exe');
  } finally { await handle.close(); }
}

function createInnoInstaller({ storage, openPath, platform = process.platform }) {
  return {
    qualify: async () => ({ ready: platform === 'win32', reason: platform === 'win32' ? null : 'unsupported-host' }),
    async start(candidate) {
      try {
        if (!/^[a-f0-9]{32}\.exe$/.test(candidate.name)) throw failure('invalid-package');
        const { file, stat } = await storage.safeFile(candidate.name);
        if (file !== candidate.file || stat.size !== candidate.size) throw failure('invalid-package');
        const hash = crypto.createHash('sha256');
        for await (const bytes of fs.createReadStream(file)) hash.update(bytes);
        if (hash.digest('hex') !== candidate.digest) throw failure('invalid-package');
        await verifyExecutable(file);
      } catch { return { status: 'failed', reason: 'invalid-package' }; }
      try {
        // Windows ShellExecute owns EXE/UAC lifetime; no child or installer wait in Resolve.
        const error = await openPath(candidate.file);
        return error ? { status: 'failed', reason: 'launch-failed' } : { status: 'handed-off', reason: null };
      } catch { return { status: 'failed', reason: 'launch-failed' }; }
    }
  };
}
module.exports = { createInnoInstaller, verifyExecutable };
