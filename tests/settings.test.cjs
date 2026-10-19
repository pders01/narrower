const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function setup(initial = {}) {
  const stored = { ...initial };
  let writes = 0;
  const context = vm.createContext({
    URL,
    chrome: { storage: { sync: {
      get: async (keys) => Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]])),
      set: async (values) => { writes++; Object.assign(stored, values); },
    } } },
  });
  vm.runInContext(readFileSync(require.resolve('../settings.js'), 'utf8'), context);
  return { api: context.Narrower, stored, writes: () => writes };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('fresh installs are opt-in, and reads never write', async () => {
  const { api, writes } = setup();
  assert.deepEqual(plain(await api.load('https://example.com/')), { enabled: false, width: 80 });
  assert.equal(writes(), 0);
});

test('widths are finite, bounded, and never zero', () => {
  const { api } = setup();
  for (const [input, expected] of [[0, 30], [-50, 30], [500, 100], [77.8, 78], [NaN, 80], [Infinity, 80], ['50', 80]]) {
    assert.equal(api.normalize({ width: input }).width, expected);
  }
  assert.equal(api.normalize(null).enabled, false);
  assert.equal(api.normalize({ enabled: 'true' }).enabled, false);
});

test('settings are per hostname, not protocol, path, or port', async () => {
  const { api } = setup();
  await api.save('https://example.com/a', { enabled: true, width: 65 });
  assert.deepEqual(plain(await api.load('http://example.com:8080/b')), { enabled: true, width: 65 });
  assert.equal((await api.load('https://other.example/')).enabled, false);
  assert.equal((await api.load('https://sub.example.com/')).enabled, false);
  assert.equal(api.siteKey('file:///tmp/a.html'), 'narrower.site.local-files');
});

test('restricted protocols are rejected', () => {
  const { api } = setup();
  for (const url of ['chrome://extensions', 'about:blank', 'data:text/html,hello', 'chrome-extension://abc/popup.html', 'edge://settings']) {
    assert.throws(() => api.siteKey(url));
  }
});

test('legacy reduction migrates without writing or collapsing content', async () => {
  const { api, writes } = setup({ globalSkew: 100, disabledSites: ['disabled.example'] });
  assert.deepEqual(plain(await api.load('https://example.com')), { enabled: true, width: 30 });
  assert.deepEqual(plain(await api.load('https://disabled.example')), { enabled: false, width: 30 });
  assert.equal(writes(), 0);
});

test('new site settings override legacy state; resetting remains off', async () => {
  const { api } = setup({ globalSkew: 40 });
  await api.save('https://example.com', api.DEFAULTS);
  assert.deepEqual(plain(await api.load('https://example.com')), { enabled: false, width: 80 });
  assert.deepEqual(plain(await api.load('https://elsewhere.example')), { enabled: true, width: 60 });
});

test('malformed legacy site lists do not break loading', async () => {
  const { api } = setup({ globalSkew: 20, disabledSites: {} });
  assert.equal((await api.load('https://example.com')).width, 80);
});
