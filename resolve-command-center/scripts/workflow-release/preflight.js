const fs = require('node:fs');
const path = require('node:path');
const { sourceIdentity } = require('./package');
const { readQualification, verifyOfficialNative } = require('./qualification');
const { readWorkflowManifest } = require('../package-internal-beta');

function preflight({ sourceRoot, publishable = true } = {}) {
  const appRoot = path.resolve(__dirname, '../..');
  const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  const checks = [];
  function check(name, run) {
    try { const detail = run(); checks.push({ name, passed: true, detail }); }
    catch (error) { checks.push({ name, passed: false, reason: error.message }); }
  }
  check('package-manifest-version', () => {
    if (readWorkflowManifest(path.join(appRoot, 'manifest.xml')).version !== pkg.version) throw new Error('Version mismatch'); return pkg.version;
  });
  check('source-commit-tag-cleanliness', () => sourceIdentity(pkg.version, { publishable }));
  check('official-source-release-qualification', () => { readQualification(undefined, { publishable }); return publishable ? 'release-qualified' : 'nonpublishable-development-only'; });
  check('explicit-official-source-native', () => {
    if (!sourceRoot) throw new Error('Provide --source-root <official Workflow Integrations directory>; hosted runner needs owner-approved artifact input');
    verifyOfficialNative(sourceRoot, readQualification()); return 'pinned-x64-PE-hash-matches';
  });
  return { version: pkg.version, publishable, ready: checks.every((item) => item.passed), checks };
}
if (require.main === module) {
  const args = process.argv.slice(2); const index = args.indexOf('--source-root');
  const result = preflight({ sourceRoot: index < 0 ? undefined : args[index + 1], publishable: !args.includes('--nonpublishable') });
  console.log(JSON.stringify(result, null, 2)); if (!result.ready) process.exitCode = 1;
}
module.exports = { preflight };
