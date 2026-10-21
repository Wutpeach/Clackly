const yauzl = require('yauzl');
const crypto = require('node:crypto');
const { failure, manifestIdentity, packageIdentity, PLUGIN_ID } = require('./identity');
const { RELEASE_MANIFEST, validateManifest, validateRuntime } = require('./release-manifest');
const MAX_ENTRIES = 20000;
const MAX_UNCOMPRESSED = 4 * 1024 * 1024 * 1024;
const REQUIRED = ['plugin/package.json', 'plugin/manifest.xml', 'plugin/workflow-plugin/main.js',
  'plugin/clackly-release.json', 'plugin/dist/renderer/index.html', 'plugin/resources/runtimes/manifest.json'];
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
function verifyZip(file, version, { signal, allowNonpublishable = false } = {}) {
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
      const files = [];
      let metadataSize = 0;
      let manifest;
      const finish = (error) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', abort);
        activeStream?.destroy();
        zip.close();
        if (error) reject(error); else resolve({ entries: count, uncompressedBytes: total, manifest });
      };
      const abort = () => finish(signal.reason || failure('cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      zip.on('error', () => finish(failure('invalid-zip')));
      zip.on('entry', (entry) => {
        try {
          const { name, directory } = entryPath(entry);
          if (/(?:^|\/)WorkflowIntegration\.node(?:\/|$)/i.test(name)) throw failure('invalid-zip');
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
          if (directory) { zip.readEntry(); return; }
          const relative = name.slice(7);
          const capture = ['package.json', 'manifest.xml', 'workflow-plugin/main.js', RELEASE_MANIFEST].includes(relative)
            || relative.startsWith('resources/runtimes/') && relative.endsWith('.json');
          const limit = relative === 'package.json' || relative === 'manifest.xml' ? 65536
            : relative === 'workflow-plugin/main.js' ? 1024 * 1024 : 16 * 1024 * 1024;
          if (capture && (!entry.uncompressedSize || entry.uncompressedSize > limit)) throw failure('invalid-zip');
          zip.openReadStream(entry, (error, stream) => {
            if (done) { stream?.destroy(); return; }
            if (error) { finish(failure('invalid-zip')); return; }
            activeStream = stream;
            const chunks = [];
            const hash = crypto.createHash('sha256');
            let size = 0;
            stream.on('error', () => finish(failure('invalid-zip')));
            stream.on('data', (chunk) => {
              size += chunk.length;
              hash.update(chunk);
              if (capture) {
                metadataSize += chunk.length;
                if (size > limit || metadataSize > 64 * 1024 * 1024) finish(failure('invalid-zip')); else chunks.push(chunk);
              }
            });
            stream.on('end', () => {
              if (done) return;
              if (capture) texts[name] = Buffer.concat(chunks).toString('utf8');
              if (relative !== RELEASE_MANIFEST) files.push({ path: relative, size, sha256: hash.digest('hex') });
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
          try {
            manifest = validateManifest(JSON.parse(texts[`plugin/${RELEASE_MANIFEST}`]), version);
            if (!allowNonpublishable && (!manifest.build.publishable || manifest.source.dirty)) {
              throw new Error('Downloaded release must be publishable and use clean source');
            }
            files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
            if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('ZIP full inventory/hash mismatch');
            validateRuntime(manifest, (name) => JSON.parse(texts[`plugin/${name}`]));
          } catch (error) { throw failure('invalid-zip'); }
          finish();
        } catch (error) { finish(error); }
      });
      zip.readEntry();
    });
  });
}
module.exports = { entryPath, verifyZip, REQUIRED, MAX_ENTRIES, MAX_UNCOMPRESSED };
