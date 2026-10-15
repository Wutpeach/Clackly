// Build-time provisioning only. This never searches the machine or reads installed plugin files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const { entryPath } = require('../../electron/main/update/zip');
const { listTree, assertNormalExistingDirectory } = require('../package-internal-beta');
const { readQualification, verifyOfficialNative } = require('./qualification');
const { powershell, quote } = require('./package');

function inspectArchive(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      let total = 0; let count = 0; const names = new Map(); const kinds = new Map();
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        try {
          const original = entry.fileName;
          entryPath({ ...entry, fileName: 'plugin/' + original });
          if (++count > 20000 || (total += entry.uncompressedSize) > 2 * 1024 * 1024 * 1024
            || entry.uncompressedSize > Math.max(1024 * 1024, entry.compressedSize * 200)) throw new Error('SDK archive bounds exceeded');
          const name = original.replace(/\/$/, ''); const key = name.toLowerCase();
          if (kinds.has(key)) throw new Error('Duplicate SDK entry');
          kinds.set(key, original.endsWith('/'));
          const parts = name.split('/');
          for (let i = 1; i <= parts.length; i++) {
            const prefix = parts.slice(0, i).join('/'); const lower = prefix.toLowerCase();
            if (names.has(lower) && names.get(lower) !== prefix || i < parts.length && kinds.get(lower) === false) throw new Error('SDK path collision');
            names.set(lower, prefix);
          }
          if (!original.endsWith('/') && [...names.keys()].some((other) => other.startsWith(key + '/'))) throw new Error('SDK file/directory collision');
          zip.readEntry();
        } catch (error) { zip.close(); reject(error); }
      });
      zip.on('end', () => {
        if (kinds.get('examples/sampleplugin/workflowintegration.node') !== false) return reject(new Error('SDK archive must retain the official Examples/SamplePlugin root layout'));
        resolve();
      });
      zip.readEntry();
    });
  });
}

async function provision({ archive, outputRoot, qualificationFile, publishable = false }) {
  const q = readQualification(qualificationFile, { publishable, archive: true });
  if (!archive || !outputRoot) throw new Error('Owner-provisioned official SDK archive and fresh output directory required');
  assertNormalExistingDirectory(path.dirname(path.resolve(archive)));
  const stat = fs.lstatSync(archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 * 1024) throw new Error('SDK archive is unsafe');
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  if (sha256 !== q.sourceArchiveSha256) throw new Error('Official SDK archive SHA-256 does not match owner-approved pin');
  await inspectArchive(archive);
  assertNormalExistingDirectory(path.dirname(path.resolve(outputRoot)));
  if (fs.existsSync(outputRoot)) throw new Error('Provision output must be new; existing owner files will not be replaced');
  fs.mkdirSync(outputRoot);
  powershell(`Expand-Archive -LiteralPath ${quote(path.resolve(archive))} -DestinationPath ${quote(path.resolve(outputRoot))}`);
  listTree(outputRoot);
  verifyOfficialNative(outputRoot, q);
  return { sourceRoot: path.resolve(outputRoot), sha256 };
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  (async () => {
    if (!args.includes('--archive') || !args.includes('--output')) throw new Error('Use --archive <official-sdk.zip> --output <new-source-directory>');
    console.log(JSON.stringify(await provision({ archive: value('--archive'), outputRoot: value('--output'), publishable: args.includes('--publishable'), qualificationFile: args.includes('--qualification') ? value('--qualification') : undefined }), null, 2));
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { provision, inspectArchive };
