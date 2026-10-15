const fs = require('node:fs');
const path = require('node:path');
const semver = require('semver');
const PLUGIN_ID = 'com.wutpeach.clackly';
const MAX_ASSET_BYTES = 1024 * 1024 * 1024;
const RELEASES_URL = 'https://api.github.com/repos/Wutpeach/Clackly/releases?per_page=100';

function failure(code, retryAt = null) {
  return Object.assign(new Error(code), { code, retryAt });
}
function stableVersion(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
    && semver.valid(value) === value ? value : null;
}
function manifestIdentity(text) {
  if (typeof text !== 'string' || text.length > 65536 || /<!|&/.test(text)) throw failure('invalid-version');
  const field = (name) => {
    const matches = [...text.matchAll(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`, 'g'))];
    if (matches.length !== 1) throw failure('invalid-version');
    return matches[0][1];
  };
  const identity = { id: field('Id'), version: field('Version'), entry: field('FilePath') };
  if (identity.id !== PLUGIN_ID || !stableVersion(identity.version) || identity.entry !== 'workflow-plugin/main.js') {
    throw failure('invalid-version');
  }
  return identity;
}
function packageIdentity(text, manifest, version) {
  let pkg;
  try { pkg = JSON.parse(text); } catch { throw failure('invalid-version'); }
  if (pkg.name !== 'clackly' || !stableVersion(pkg.version) || pkg.version !== manifest.version
    || (version && pkg.version !== version)) throw failure('invalid-version');
  return pkg.version;
}
function installedVersion(appRoot) {
  try {
    return packageIdentity(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'),
      manifestIdentity(fs.readFileSync(path.join(appRoot, 'manifest.xml'), 'utf8')));
  } catch { return null; }
}
function assetUrl(value, version, name) {
  let url;
  try { url = new URL(value); } catch { throw failure('invalid-source'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password
    || url.search || url.hash || url.pathname !== `/Wutpeach/Clackly/releases/download/${version}/${name}`
    && url.pathname !== `/Wutpeach/Clackly/releases/download/v${version}/${name}`) throw failure('invalid-source');
  return url.href;
}
function selectRelease(releases, currentVersion) {
  if (!Array.isArray(releases) || releases.length > 100) throw failure('invalid-response');
  const stable = releases.filter((release) => release && release.draft === false && release.prerelease === false
    && stableVersion(typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : null));
  stable.sort((a, b) => semver.rcompare(a.tag_name.replace(/^v/, ''), b.tag_name.replace(/^v/, '')));
  if (!stable.length) return { status: 'no-release', release: null };
  const candidate = stable[0];
  const version = candidate.tag_name.replace(/^v/, '');
  const notes = typeof candidate.body === 'string' ? candidate.body.slice(0, 20000) : '';
  if (!semver.gt(version, currentVersion)) return { status: 'up-to-date', release: { version, notes } };
  const name = `Clackly-Workflow-${version}-win-x64.zip`;
  const assets = Array.isArray(candidate.assets) ? candidate.assets.filter((asset) => asset?.name === name) : [];
  const unavailable = () => ({ status: 'unavailable', release: { version, notes }, error: { code: 'invalid-asset' } });
  if (assets.length !== 1) return unavailable();
  const asset = assets[0];
  if (!Number.isSafeInteger(candidate.id) || candidate.id <= 0 || !Number.isSafeInteger(asset.id) || asset.id <= 0
    || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_ASSET_BYTES
    || !['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(asset.content_type)
    || asset.state !== 'uploaded' || !/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest || '')) return unavailable();
  let url;
  try { url = assetUrl(asset.browser_download_url, version, name); } catch { return unavailable(); }
  return { status: 'available', release: { version, notes, releaseId: candidate.id, assetId: asset.id,
    size: asset.size, digest: asset.digest.slice(7).toLowerCase(), url } };
}
module.exports = { PLUGIN_ID, MAX_ASSET_BYTES, RELEASES_URL, failure, stableVersion, manifestIdentity,
  packageIdentity, installedVersion, assetUrl, selectRelease };
