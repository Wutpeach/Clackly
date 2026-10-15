const yauzl = require('yauzl');
const { failure, manifestIdentity, packageIdentity, PLUGIN_ID } = require('./identity');
const MAX_ENTRIES = 20000;
const MAX_UNCOMPRESSED = 4 * 1024 * 1024 * 1024;
const REQUIRED = ['plugin/package.json', 'plugin/manifest.xml', 'plugin/workflow-plugin/main.js',
  'plugin/workflow-plugin/WorkflowIntegration.node', 'plugin/dist/renderer/index.html', 'plugin/resources/runtimes/manifest.json'];
function entryPath(entry) {
  const name = entry.fileName;
  const directory = name.endsWith('/');
  const parts = (directory ? name.slice(0, -1) : name).split('/');
  if (name.length > 240 || !name.startsWith('plugin/') || name.includes('\\') || name.includes(':')
    || /[\x00-\x1f\x7f]/.test(name) || parts.some((part) => !part || part === '.' || part === '..'
      || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw failure('invalid-zip');
  const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (entry.generalPurposeBitFlag & 1 || ![0, 0x8000, 0x4000].includes(mode)
    || mode === 0x4000 && !directory || mode === 0x8000 && directory
    || (entry.externalFileAttributes & 0x400) !== 0) throw failure('invalid-zip');
  if (![0, 8].includes(entry.compressionMethod) || !Number.isSafeInteger(entry.uncompressedSize)
    || entry.uncompressedSize > 1024 * 1024 * 1024 || directory && entry.uncompressedSize !== 0) throw failure('invalid-zip');
  return { name, directory };
}
function verifyZip(file, version, { signal } = {}) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) { reject(failure('invalid-zip')); return; }
      let done = false;
      let count = 0;
      let total = 0;
      let activeStream;
      const entries = new Map();
      const spelling = new Map();
      const parents = new Set();
      const sizes = new Map();
      const texts = {};
      const finish = (error) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', abort);
        activeStream?.destroy();
        zip.close();
        if (error) reject(error); else resolve({ entries: count, uncompressedBytes: total });
      };
      const abort = () => finish(signal.reason || failure('cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      zip.on('error', () => finish(failure('invalid-zip')));
      zip.on('entry', (entry) => {
        try {
          const { name, directory } = entryPath(entry);
          const key = name.replace(/\/$/, '').toLowerCase();
          const parts = name.replace(/\/$/, '').split('/');
          for (let length = 1; length <= parts.length; length++) {
            const prefix = parts.slice(0, length).join('/');
            const old = spelling.get(prefix.toLowerCase());
            if (old && old !== prefix) throw failure('invalid-zip');
            spelling.set(prefix.toLowerCase(), prefix);
          }
          if (++count > MAX_ENTRIES || entries.has(key)) throw failure('invalid-zip');
          if (!directory && parents.has(key)) throw failure('invalid-zip');
          for (let length = 1; length < parts.length; length++) {
            const parent = parts.slice(0, length).join('/').toLowerCase();
            if (entries.has(parent) && !entries.get(parent)) throw failure('invalid-zip');
            parents.add(parent);
          }
          entries.set(key, directory);
          sizes.set(key, entry.uncompressedSize);
          total += entry.uncompressedSize;
          if (total > MAX_UNCOMPRESSED || entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * 200)) throw failure('invalid-zip');
          if (!['plugin/package.json', 'plugin/manifest.xml', 'plugin/workflow-plugin/main.js'].includes(name)) { zip.readEntry(); return; }
          const limit = name.endsWith('main.js') ? 1024 * 1024 : 65536;
          if (directory || !entry.uncompressedSize || entry.uncompressedSize > limit) throw failure('invalid-zip');
          zip.openReadStream(entry, (error, stream) => {
            if (done) { stream?.destroy(); return; }
            if (error) { finish(failure('invalid-zip')); return; }
            activeStream = stream;
            const chunks = [];
            let size = 0;
            stream.on('error', () => finish(failure('invalid-zip')));
            stream.on('data', (chunk) => {
              size += chunk.length;
              if (size > limit) finish(failure('invalid-zip')); else chunks.push(chunk);
            });
            stream.on('end', () => {
              if (done) return;
              texts[name] = Buffer.concat(chunks).toString('utf8');
              activeStream = null;
              zip.readEntry();
            });
          });
        } catch (error) { finish(error); }
      });
      zip.on('end', () => {
        try {
          for (const name of REQUIRED) {
            const key = name.toLowerCase();
            if (!entries.has(key) || entries.get(key) !== false || spelling.get(key) !== name || !sizes.get(key)) throw failure('invalid-zip');
          }
          packageIdentity(texts['plugin/package.json'], manifestIdentity(texts['plugin/manifest.xml']), version);
          const main = texts['plugin/workflow-plugin/main.js'];
          const ids = [...main.matchAll(/\bconst\s+PLUGIN_ID\s*=\s*["']([^"']+)["']\s*;/g)];
          if (ids.length !== 1 || ids[0][1] !== PLUGIN_ID) throw failure('invalid-version');
          finish();
        } catch (error) { finish(error); }
      });
      zip.readEntry();
    });
  });
}
module.exports = { entryPath, verifyZip, REQUIRED, MAX_ENTRIES, MAX_UNCOMPRESSED };
