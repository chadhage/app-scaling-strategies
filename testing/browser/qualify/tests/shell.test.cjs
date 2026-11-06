'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const adapters = require('../adapters.cjs');
const { fakeShell, scratchDir, removeDir, ECHO_ANSWER } = require('./harness.cjs');

const run = (code, extra = [], timeoutMs = 20000) => adapters.runShell({
  ...fakeShell(code, extra), args: fakeShell(code, extra).buildArgs(), env: process.env, timeoutMs,
});

test('runShell returns what the shell wrote when it exits 0', async () => {
  assert.equal(await run("process.stdout.write('hello')"), 'hello');
});

test('a shell that exits non-zero fails with SHELL_FAILED and the tail of stderr', async () => {
  await assert.rejects(run("process.stderr.write('bad thing'); process.exit(3)"), (error) => {
    assert.equal(error.code, 'SHELL_FAILED');
    assert.match(error.message, /exited with 3: bad thing/);
    return true;
  });
});

test('a shell that is missing or cannot be started fails with SHELL_SPAWN', async () => {
  const base = { args: [], env: process.env, timeoutMs: 5000 };
  await assert.rejects(adapters.runShell({ ...base, shell: path.join(__dirname, 'no-such-shell.exe') }), { code: 'SHELL_SPAWN' });
  await assert.rejects(adapters.runShell({ ...base, shell: 'a\u0000b' }), { code: 'SHELL_SPAWN' });
});

test('a shell that writes more than 64 KiB is ended with SHELL_OUTPUT_TOO_LARGE', { timeout: 60000 }, async () => {
  await assert.rejects(run("process.stdout.write('x'.repeat(200000)); setInterval(() => {}, 1000)"), { code: 'SHELL_OUTPUT_TOO_LARGE' });
});

test('a shell that hangs past the timeout is ended and fails with SHELL_TIMEOUT', { timeout: 60000 }, async () => {
  const dir = scratchDir();
  const pidFile = path.join(dir, 'pid.txt');
  const code = "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000)";
  try {
    const started = Date.now();
    await assert.rejects(run(code, [pidFile], 4000), { code: 'SHELL_TIMEOUT' });
    assert.ok(Date.now() - started < 15000);
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  } finally {
    removeDir(dir);
  }
});

test('the path travels in QUALIFY_TARGET only and the inherited PowerShell 7 module path is dropped', async () => {
  const hostile = 'C:\\Program Files (x86)\\a & b;"$(calc)`\'x%PATH%\\msedge.exe';
  const set = adapters.powerShellAdapters({
    ...fakeShell(ECHO_ANSWER), env: { ...process.env, PSModulePath: 'C:\\pwsh7\\Modules' },
  });
  const signature = await set.signature(hostile);
  assert.equal(signature.status, 'Valid');
  assert.equal(signature.subject, hostile);
  assert.equal(signature.issuer, '[]');
  assert.equal(signature.thumbprint, 'false');
});

test('one shell start answers both questions for a path and another path starts another shell', async () => {
  const set = adapters.powerShellAdapters(fakeShell(ECHO_ANSWER));
  const [signature, version] = await Promise.all([set.signature('C:\\one.exe'), set.fileVersion('C:\\one.exe')]);
  const other = await set.fileVersion('C:\\two.exe');
  assert.equal(typeof version, 'string');
  assert.equal(signature.statusMessage, version);
  assert.notEqual(other, version);
  assert.deepEqual(Object.keys(signature), ['status', 'statusMessage', 'subject', 'issuer', 'thumbprint']);
});

test('the script reaches the shell as one encoded argument that decodes to INSPECT_SCRIPT', async () => {
  const code = [
    'const script = Buffer.from(process.argv[1], "base64").toString("utf16le");',
    'const answer = { status: "Valid", statusMessage: script, fileVersion: process.argv.length === 2 ? "one-argument" : "many" };',
    'process.stdout.write(Buffer.from(JSON.stringify(answer)).toString("base64"));',
  ].join('\n');
  const set = adapters.powerShellAdapters({ shell: process.execPath, buildArgs: (encoded) => ['-e', code, encoded] });
  const signature = await set.signature('C:\\x.exe');
  assert.equal(signature.statusMessage, adapters.INSPECT_SCRIPT);
  assert.equal(await set.fileVersion('C:\\x.exe'), 'one-argument');
});

test('a shell that is missing, fails or answers garbage makes both adapters reject, and a hang times out', { timeout: 60000 }, async () => {
  const missing = adapters.powerShellAdapters({ env: { SystemRoot: path.join(__dirname, 'no-such-windows') } });
  await assert.rejects(missing.signature('C:\\x.exe'), (error) => error.code === 'SHELL_SPAWN' && /powershell\.exe/.test(error.message));
  const garbage = adapters.powerShellAdapters(fakeShell("process.stdout.write('garbage!')"));
  await assert.rejects(garbage.fileVersion('C:\\x.exe'), { code: 'INSPECT_OUTPUT_INVALID' });
  const hanging = adapters.powerShellAdapters({ ...fakeShell('setInterval(() => {}, 1000)'), timeoutMs: 600 });
  await assert.rejects(hanging.signature('C:\\x.exe'), { code: 'SHELL_TIMEOUT' });
});

test('defaultAdapters passes its shell settings to the PowerShell adapters', async () => {
  const set = adapters.defaultAdapters({ shell: fakeShell(ECHO_ANSWER) });
  assert.equal((await set.signature('C:\\y.exe')).subject, 'C:\\y.exe');
});
