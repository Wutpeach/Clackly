const https = require('node:https');
const { failure, RELEASES_URL } = require('./identity');

function validateUrl(value, kind, redirect = false) {
  let url;
  try { url = new URL(value); } catch { throw failure('invalid-source'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) throw failure('invalid-source');
  if (kind === 'releases') {
    if (url.href !== RELEASES_URL) throw failure('invalid-source');
  } else if (url.hostname === 'github.com') {
    if (!/^\/Wutpeach\/Clackly\/releases\/download\/v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\/Clackly-Workflow-\d+\.\d+\.\d+-win-x64\.zip$/.test(url.pathname) || url.search) throw failure('invalid-source');
  } else if (!redirect || !['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)
    || !/^\/github-production-release-asset(?:-[a-z0-9]+)?\//.test(url.pathname)) throw failure('invalid-source');
  return url;
}
function retryTime(headers, now) {
  const value = headers['retry-after'];
  let at = /^\d+$/.test(value || '') ? now + Number(value) * 1000 : Date.parse(value);
  const reset = Number(headers['x-ratelimit-reset']) * 1000;
  if (headers['x-ratelimit-remaining'] === '0' && Number.isFinite(reset)) at = Math.max(at || 0, reset);
  return Number.isFinite(at) ? Math.min(now + 7 * 86400000, Math.max(now + 60000, at)) : now + 15 * 60000;
}
function openResponse(value, { kind, signal, request = https.get, now = Date.now, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = validateUrl(value, kind, redirects > 0); } catch (error) { reject(error); return; }
    const req = request(url, { signal, headers: { 'User-Agent': 'Clackly-Workflow-Updater',
      Accept: kind === 'releases' ? 'application/vnd.github+json' : 'application/octet-stream',
      'Accept-Encoding': 'identity', 'X-GitHub-Api-Version': '2022-11-28' } }, (response) => {
      const status = response.statusCode;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.destroy();
        if (kind === 'releases' || redirects >= 3 || !response.headers.location) { reject(failure('invalid-source')); return; }
        let destination;
        try { destination = new URL(response.headers.location, url).href; } catch { reject(failure('invalid-source')); return; }
        resolve(openResponse(destination, { kind, signal, request, now, redirects: redirects + 1 }));
        return;
      }
      if (status === 429 || status === 403 && response.headers['x-ratelimit-remaining'] === '0') {
        response.destroy(); reject(failure('rate-limit', retryTime(response.headers, now()))); return;
      }
      if (status !== 200 || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy(); reject(failure('network')); return;
      }
      resolve(response);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(failure('timeout')));
  });
}
async function readReleases({ signal, open = openResponse } = {}) {
  const response = await open(RELEASES_URL, { kind: 'releases', signal });
  const chunks = [];
  let size = 0;
  for await (const chunk of response) {
    signal?.throwIfAborted();
    size += chunk.length;
    if (size > 2 * 1024 * 1024) { response.destroy(); throw failure('invalid-response'); }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure('invalid-response'); }
}
module.exports = { validateUrl, retryTime, openResponse, readReleases };
