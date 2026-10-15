const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { validateUrl, retryTime, openResponse, readReleases } = require('./network');
const { RELEASES_URL } = require('./identity');
const { release } = require('./fixtures');
const url = release().assets[0].browser_download_url;
function fakeRequest(responses, observed = []) {
  return (target, options, callback) => {
    observed.push(target.href);
    const req = new EventEmitter(); req.setTimeout = () => {};
    queueMicrotask(() => {
      const fixture = responses.shift();
      const stream = Readable.from(fixture.body || ['[]']);
      stream.headers = fixture.headers || {}; stream.statusCode = fixture.status || 200;
      callback(stream);
    });
    return req;
  };
}
test('HTTPS and repository boundaries reject foreign origins, credentials and metadata redirects', async () => {
  for (const bad of [url.replace('https:', 'http:'), url.replace('github.com', 'github.com.evil'),
    url.replace('Wutpeach', 'foreign'), url.replace('github.com', 'name:pass@github.com'), `${url}?path=evil`,
    'https://release-assets.githubusercontent.com/github-production-release-asset/a']) assert.throws(() => validateUrl(bad, 'asset'));
  await assert.rejects(openResponse(RELEASES_URL, { kind: 'releases',
    request: fakeRequest([{ status: 302, headers: { location: 'https://evil.test/' } }]) }), { code: 'invalid-source' });
});
test('only bounded official CDN redirects followed; response/rate-limit handled', async () => {
  const observed = [];
  const request = fakeRequest([{ status: 302, headers: { location: 'https://release-assets.githubusercontent.com/github-production-release-asset/1/2?sig=fixture' } },
    { status: 200 }], observed);
  const stream = await openResponse(url, { kind: 'asset', request }); stream.destroy();
  assert.equal(observed.length, 2);
  for (const location of ['https://evil.test/file', 'https://release-assets.githubusercontent.com/not-release/file', 'file:///C:/file']) {
    await assert.rejects(openResponse(url, { kind: 'asset', request: fakeRequest([{ status: 302, headers: { location } }]) }), { code: 'invalid-source' });
  }
  await assert.rejects(openResponse(url, { kind: 'asset', now: () => 1000,
    request: fakeRequest([{ status: 429, headers: { 'retry-after': '120' } }]) }), { code: 'rate-limit', retryAt: 121000 });
  await assert.rejects(openResponse(url, { kind: 'asset', request: fakeRequest([{ status: 206 }]) }), { code: 'network' });
  assert.equal(retryTime({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '200' }, 1000), 200000);
});
test('release JSON read completely, malformed and oversized bodies rejected', async () => {
  const body = JSON.stringify([{ ...release(), body: 'a'.repeat(10000) }]);
  assert.equal((await readReleases({ open: async () => Readable.from([body.slice(0, 4000), body.slice(4000)]) })).length, 1);
  await assert.rejects(readReleases({ open: async () => Readable.from(['{']) }), { code: 'invalid-response' });
  await assert.rejects(readReleases({ open: async () => Readable.from([Buffer.alloc(3 * 1024 * 1024)]) }), { code: 'invalid-response' });
});
