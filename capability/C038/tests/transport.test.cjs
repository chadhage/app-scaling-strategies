'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const script = path.join(__dirname, 'transport.ps1');
function run(entries) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) delete env[key];
  delete env.CAPTURE_BROWSER_EVIDENCE;
  delete env.C038_CAPTURE_DIR;
  Object.assign(env, entries);
  return spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script, '-Mode', 'Probe'],
    { env, windowsHide: true, timeout: 120000, encoding: 'utf8', maxBuffer: 65536 });
}
for (const [name, entries] of [
  ['initial absent count and slots', {}],
  ['present zero count and unused existing slots', { GIT_CONFIG_COUNT: '0', GIT_CONFIG_KEY_0: 'preserve-spare', GIT_CONFIG_VALUE_0: '' }],
  ['all initially empty spare values', { GIT_CONFIG_KEY_0: '', GIT_CONFIG_VALUE_0: '' }],
  ['initial absent key but present empty value', { GIT_CONFIG_VALUE_0: '' }],
  ['initial present key but absent value', { GIT_CONFIG_KEY_0: 'preserve-unused-key' }],
  ['existing active configuration and spare append slot', {
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.quotepath', GIT_CONFIG_VALUE_0: 'false',
    GIT_CONFIG_KEY_1: 'core.abbrev', GIT_CONFIG_VALUE_1: '9'
  }]
]) test(`process-local transport preserves ${name} exactly`, () => {
  const result = run(entries);
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.httpVersion, 'HTTP/1.1');
  assert.equal(proof.allPresenceAndValuesRestoredInFinally, true);
  assert.equal(proof.safeGitReadAfterRestoration, true);
  assert.equal(proof.initialAbsentKeysRemovedWithEnvProvider, true);
  assert.equal(proof.standardPublisherDelegated, false);
  assert.equal(proof.globalConfigChanged, false);
  assert.equal(proof.tlsProxyOrAuthConfigurationChanged, false);
  assert.equal(proof.initialCountPresent, Object.hasOwn(entries, 'GIT_CONFIG_COUNT'));
});
for (const [name, entries] of [
  ['empty present count', { GIT_CONFIG_COUNT: '' }],
  ['nonnumeric count', { GIT_CONFIG_COUNT: 'not-a-count' }],
  ['negative count', { GIT_CONFIG_COUNT: '-1' }],
  ['oversize count', { GIT_CONFIG_COUNT: '4097' }],
  ['missing existing key', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_VALUE_0: 'true' }],
  ['missing existing value', { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.quotepath' }]
]) test(`process-local transport rejects ${name} before mutation`, () => {
  const result = run(entries);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no mutation/);
});
