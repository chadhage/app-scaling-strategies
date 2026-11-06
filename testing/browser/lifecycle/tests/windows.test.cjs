'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fakeSpawn, succeed } = require('./support/fake-spawn.cjs');
const { loadImplementation } = require('./support/impl.cjs');

const { createWindowsAdapters } = loadImplementation().windows;
const env = { SystemRoot: 'C:\\Windows' };
const make = (behave, extra = {}) => {
  const spawn = fakeSpawn(behave);
  return { spawn, adapters: createWindowsAdapters({ platform: 'win32', env, spawn, ...extra }) };
};

test('only Windows is supported and the helper needs a system root', () => {
  assert.throws(() => createWindowsAdapters({ platform: 'linux', env }), { code: 'ERR_PLATFORM' });
  assert.throws(() => createWindowsAdapters({ platform: 'win32', env: {} }), { code: 'ERR_PLATFORM' });
  assert.equal(typeof createWindowsAdapters({ platform: 'win32', env: { windir: 'C:\\Windows' }, spawn: fakeSpawn({}) }).list, 'function');
});

test('list runs one hidden Windows PowerShell 5.1 helper through standard input and parses the table', async () => {
  const { spawn, adapters } = make({ run: succeed('4,0,134000000000000001\n77,4,-\n') });
  const rows = await adapters.list({ timeoutMs: 5000 });
  assert.deepEqual(rows, [{ pid: 4, ppid: 0, createdAt: '134000000000000001' }, { pid: 77, ppid: 4, createdAt: null }]);
  const [call] = spawn.calls;
  assert.equal(call.command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(call.args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.equal(call.args.length, 5);
  assert.ok(!call.args.some((arg) => /ExecutionPolicy|Bypass/i.test(arg)), 'no policy override');
  assert.equal(call.stdin, 'list\n');
  assert.equal(call.options.windowsHide, true);
  assert.notEqual(call.options.shell, true);
  const script = Buffer.from(call.args[4], 'base64').toString('utf16le');
  assert.match(script, /Add-Type/);
  assert.doesNotMatch(script, /taskkill|Stop-Process|\/IM|CommandLine|Get-CimInstance/i, 'no name or marker based mechanism');
});

test('kill sends pids and creation times only on standard input and maps every outcome', async () => {
  const output = '3000,killed\n3004,gone\n3008,mismatch\n3012,survived\n3016,error:open:5\n';
  const { spawn, adapters } = make({ run: succeed(output) });
  const identities = [3000, 3004, 3008, 3012, 3016].map((pid) => ({ pid, createdAt: `1340000000000000${pid}` }));
  const outcomes = await adapters.kill(identities, { timeoutMs: 9000 });
  assert.deepEqual(outcomes.map((o) => [o.pid, o.outcome]), [[3000, 'killed'], [3004, 'gone'], [3008, 'mismatch'], [3012, 'survived'], [3016, 'error']]);
  assert.match(outcomes[4].detail, /open:5/);
  assert.equal(outcomes[0].createdAt, identities[0].createdAt);
  const [call] = spawn.calls;
  assert.match(call.stdin, /^kill\n\d+\n3000,13400000000000003000\n3004,/);
  assert.ok(!call.args.join(' ').includes('3000'), 'identities never reach the command line');
});

test('kill validates identities and does not start a helper for an empty request', async () => {
  const { spawn, adapters } = make({ run: succeed('') });
  assert.deepEqual(await adapters.kill([]), []);
  for (const bad of [{ pid: 0, createdAt: '1' }, { pid: 5, createdAt: 'x' }, { pid: 5 }, null]) {
    await assert.rejects(adapters.kill([bad]), { code: 'ERR_INVALID_ARG' });
  }
  await assert.rejects(adapters.kill('nope'), { code: 'ERR_INVALID_ARG' });
  assert.equal(spawn.calls.length, 0);
});

test('a hung helper is ended at the deadline and reported as a timeout', async () => {
  const { spawn, adapters } = make({});
  await assert.rejects(adapters.list({ timeoutMs: 20 }), { code: 'ERR_TIMEOUT' });
  assert.equal(spawn.calls[0].killed, 1);
});

test('helper failures surface as errors with the helper message', async () => {
  const failed = make({ run: (child) => { child.stderr.emit('data', Buffer.from('boom text')); child.emit('close', 1); } });
  await assert.rejects(failed.adapters.list({ timeoutMs: 5000 }), { code: 'ERR_HELPER', message: /boom text/ });
  const thrown = make({ throws: new Error('spawn exploded') });
  await assert.rejects(thrown.adapters.list({ timeoutMs: 5000 }), { code: 'ERR_HELPER', message: /spawn exploded/ });
  const errored = make({ run: (child) => child.emit('error', new Error('no such file')) });
  await assert.rejects(errored.adapters.list({ timeoutMs: 5000 }), { code: 'ERR_HELPER', message: /no such file/ });
  const garbled = make({ run: succeed('not a table\n') });
  await assert.rejects(garbled.adapters.list({ timeoutMs: 5000 }), { code: 'ERR_HELPER', message: /malformed/ });
  const garbledKill = make({ run: succeed('12,exploded\n') });
  await assert.rejects(garbledKill.adapters.kill([{ pid: 12, createdAt: '5' }], { timeoutMs: 5000 }), { code: 'ERR_HELPER', message: /malformed/ });
  const huge = make({ run: (child) => child.stdout.emit('data', Buffer.alloc(2048, 'x')) }, { maxOutputBytes: 1024 });
  await assert.rejects(huge.adapters.list({ timeoutMs: 5000 }), { code: 'ERR_OUTPUT' });
  assert.equal(huge.spawn.calls[0].killed, 1);
});

test('the clock is monotonic, sleep waits and the caller pid is exposed', async () => {
  const { adapters } = make({});
  const first = adapters.now();
  await adapters.sleep(15);
  assert.ok(adapters.now() - first >= 10);
  assert.equal(adapters.selfPid, process.pid);
});
