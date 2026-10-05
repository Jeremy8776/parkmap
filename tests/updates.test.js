// Release selection for the Android updater. Run: node tests/updates.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', '80-updates.js'), 'utf8');
const context = vm.createContext({ window: {}, URL, console });
vm.runInContext(code + '\n;globalThis.api = { releaseCode, selectUpdate };', context);
const { releaseCode, selectUpdate } = context.api;
const digest = 'sha256:' + 'a'.repeat(64);
function release(tag, overrides = {}) {
  return { tag_name: tag, draft: false, prerelease: true, assets: [{
    name: `parkmap-${tag}.apk`, digest, size: 6000000,
    browser_download_url: `https://github.com/Jeremy8776/parkmap/releases/download/${tag}/parkmap-${tag}.apk`,
    ...overrides
  }] };
}
assert.strictEqual(releaseCode('v0.3.1'), 3001);
assert.strictEqual(releaseCode('v1.0.0'), 1000000);
assert.strictEqual(releaseCode('v0.3.1-rc1'), null);
assert.strictEqual(releaseCode('v0.1000.0'), null);
assert.strictEqual(releaseCode('v2148.0.0'), null);
assert.strictEqual(selectUpdate([release('v0.3.0'), release('v0.4.0'), release('v0.3.1')], 3000).tag_name, 'v0.4.0');
assert.strictEqual(selectUpdate([release('v0.3.0')], 3000), null);
assert.strictEqual(selectUpdate([release('v0.3.0', { digest: null })], 1), null);
assert.strictEqual(selectUpdate([release('v0.3.0', { browser_download_url: 'https://example.org/evil.apk' })], 1), null);
assert.strictEqual(selectUpdate([release('v0.3.0', { size: 100 })], 1), null);
assert.strictEqual(selectUpdate([{ ...release('v0.3.0'), draft: true }], 1), null);
assert.strictEqual(selectUpdate([release('v0.2.0', { name: 'parkmap-v0.2.0-debug.apk' })], 1), null);
console.log('11 updater checks passed');
