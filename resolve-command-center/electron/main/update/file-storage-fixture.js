// File-backed service fixture only. Production path/reparse/atomic-write behavior
// is exercised with UpdateStorage in windows.integration.js, without this adapter.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { failure } = require('./identity');

function fileStorage(root) {
  const file = (name) => path.join(root, name);
  const prepare = () => fs.mkdir(root, { recursive: true });
  return {
    file,
    async readCache() {
      await prepare();
      try { return JSON.parse(await fs.readFile(file('cache.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
    },
    async saveCache(cache) { await prepare(); await fs.writeFile(file('cache.json'), JSON.stringify(cache)); },
    async safeFile(name) { return { file: file(name), stat: await fs.stat(file(name)) }; },
    async remove(name) { await fs.rm(file(name), { force: true }); },
    async cleanupDownloads(keep = null) {
      await prepare();
      for (const name of await fs.readdir(root)) {
        if (/^[a-f0-9]{32}\.(part|zip)$/.test(name) && name !== keep) await fs.unlink(file(name));
      }
    },
    async allocate(size, space = fs.statfs) {
      await prepare();
      const stats = await space(root);
      if (Number(stats.bavail) * Number(stats.bsize) < size + 64 * 1024 * 1024) throw failure('disk-space');
      const token = crypto.randomBytes(16).toString('hex');
      const name = `${token}.part`;
      return { name, finalName: `${token}.zip`, handle: await fs.open(file(name), 'wx') };
    },
    async retain(name, finalName) { await fs.rename(file(name), file(finalName)); }
  };
}
module.exports = { fileStorage };
