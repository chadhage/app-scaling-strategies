'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const adapters = require('../adapters.cjs');

const ENV = {
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
  PROGRAMFILES: 'C:\\Program Files',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  HOMEDRIVE: 'C:',
};
const SUFFIX = 'Microsoft\\Edge\\Application\\msedge.exe';

test('the candidates follow the Playwright msedge order and drop duplicates', () => {
  assert.deepEqual(adapters.edgeCandidates(ENV), [
    `C:\\Users\\me\\AppData\\Local\\${SUFFIX}`, `C:\\Program Files\\${SUFFIX}`, `C:\\Program Files (x86)\\${SUFFIX}`,
  ]);
  const other = { ...ENV, HOMEDRIVE: 'D:' };
  assert.deepEqual(adapters.edgeCandidates(other).slice(3), [`D:\\Program Files\\${SUFFIX}`, `D:\\Program Files (x86)\\${SUFFIX}`]);
});

test('environment names are case-insensitive and a missing or relative root is skipped, never turned into "undefined"', () => {
  const mixed = { LocalAppData: 'C:\\L', ProgramFiles: 'C:\\P', 'ProgramFiles(x86)': 'C:\\Q' };
  assert.deepEqual(adapters.edgeCandidates(mixed), [`C:\\L\\${SUFFIX}`, `C:\\P\\${SUFFIX}`, `C:\\Q\\${SUFFIX}`]);
  assert.deepEqual(adapters.edgeCandidates({}), []);
  assert.deepEqual(adapters.edgeCandidates({ LOCALAPPDATA: 'relative\\dir', PROGRAMFILES: '', HOMEDRIVE: undefined }), []);
  assert.ok(adapters.edgeCandidates().every((candidate) => path.win32.isAbsolute(candidate)));
});

test('statFile describes a real file and a real directory and reports anything else as absent', () => {
  const file = adapters.statFile(__filename);
  assert.equal(file.exists, true);
  assert.equal(file.isFile, true);
  assert.ok(file.size > 0 && file.mtimeMs > 0);
  assert.equal(adapters.statFile(__dirname).isFile, false);
  assert.deepEqual(adapters.statFile(path.join(__dirname, 'no-such-file.exe')), { exists: false });
  const throwing = { statSync() { throw new Error('EACCES'); } };
  assert.deepEqual(adapters.statFile('x', throwing), { exists: false });
});

test('sha256File hashes the real bytes of a file and of a stream, and rejects on a read error', async () => {
  const file = path.join(__dirname, '..', 'qualified.json');
  assert.equal(await adapters.sha256File(file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  const chunks = { createReadStream: () => Readable.from([Buffer.from('ab'), Buffer.from('c')]) };
  assert.equal(await adapters.sha256File('x', chunks), crypto.createHash('sha256').update('abc').digest('hex'));
  await assert.rejects(adapters.sha256File(path.join(__dirname, 'no-such-file.exe')), { code: 'ENOENT' });
  const failing = { createReadStream: () => new Readable({ read() { this.destroy(new Error('locked')); } }) };
  await assert.rejects(adapters.sha256File('x', failing), /locked/);
});

test('readQualified reads the shipped list by default and throws on unreadable or invalid JSON', () => {
  assert.ok(adapters.readQualified().qualifiedMajors.includes(156));
  assert.equal(adapters.QUALIFIED_FILE, path.join(__dirname, '..', 'qualified.json'));
  assert.throws(() => adapters.readQualified('x', { readFileSync: () => '{ not json' }), SyntaxError);
  assert.throws(() => adapters.readQualified(path.join(__dirname, 'no-such-file.json')), { code: 'ENOENT' });
});

test('withoutKeys drops matching names whatever their case and keeps the rest', () => {
  const env = { PSModulePath: 'a', PSMODULEPATH: 'b', Path: 'c', NODE_V8_COVERAGE: 'd' };
  assert.deepEqual(adapters.withoutKeys(env, /^psmodulepath$/i), { Path: 'c', NODE_V8_COVERAGE: 'd' });
});

test('the Windows PowerShell location comes from SystemRoot and the arguments carry an encoded command', () => {
  assert.equal(adapters.windowsPowerShellPath({ SystemRoot: 'D:\\Win' }), 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.equal(adapters.windowsPowerShellPath({}), 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.ok(adapters.windowsPowerShellPath().endsWith('powershell.exe'));
  assert.deepEqual(adapters.defaultShellArgs('QUJD'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', 'QUJD']);
});

test('the inspection script takes the path from the environment and uses -LiteralPath, never string interpolation', () => {
  const script = adapters.INSPECT_SCRIPT;
  assert.match(script, /\$target = \$env:QUALIFY_TARGET/);
  assert.match(script, /Get-AuthenticodeSignature -LiteralPath \$target/);
  assert.match(script, /GetVersionInfo\(\$target\)/);
  assert.equal(adapters.TARGET_VARIABLE, 'QUALIFY_TARGET');
  assert.doesNotMatch(script, /Program Files|msedge/);
});

test('decodeInspection accepts only base64 JSON with a signature status', () => {
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
  assert.deepEqual(adapters.decodeInspection(`${encode({ status: 'Valid', fileVersion: '1.2.3.4' })}\r\n`), { status: 'Valid', fileVersion: '1.2.3.4' });
  for (const bad of ['', 'not base64!', Buffer.from('not json').toString('base64'), encode({ nostatus: 1 }), encode(null), encode({ status: 5 })]) {
    assert.throws(() => adapters.decodeInspection(bad), { code: 'INSPECT_OUTPUT_INVALID' }, bad);
  }
});

test('defaultAdapters supplies every adapter that qualifyEdge needs', () => {
  const set = adapters.defaultAdapters();
  for (const name of ['candidates', 'statFile', 'sha256', 'readQualified', 'now', 'signature', 'fileVersion']) {
    assert.equal(typeof set[name], 'function', name);
  }
  assert.ok(set.now() instanceof Date);
});
