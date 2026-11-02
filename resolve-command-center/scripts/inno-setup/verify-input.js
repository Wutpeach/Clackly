const fs = require('node:fs');
const path = require('node:path');
const { sourceIdentity, verifyArchive } = require('../workflow-release/package');

async function verifyInput(archive, { appRoot = path.resolve(__dirname, '../..') } = {}) {
  const { version } = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const verified = await verifyArchive(archive, version);
  const { source, build } = verified.manifest;
  const current = sourceIdentity(version, { appRoot, publishable: build.publishable });
  if (current.dirty || source.dirty || source.commit !== current.commit) {
    throw new Error('Setup requires an archive from this exact clean source commit');
  }
  return { version, source, publishable: build.publishable, sha256: verified.sha256 };
}
if (require.main === module) {
  verifyInput(path.resolve(process.argv[2])).then((result) => console.log(JSON.stringify(result)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { verifyInput };
