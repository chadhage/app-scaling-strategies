'use strict';
// CLI: exit 0 ok, 1 findings, 2 usage or unreadable input. In-process through main(argv, io) plus real child processes.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { assert, test, load, reseal, NOW } = require('./support.cjs');
const { main } = require('../validate-packet.cjs');

const CLI = path.join(__dirname, '..', 'validate-packet.cjs');

function io(files = {}) {
  const out = [];
  const err = [];
  return {
    out, err,
    read: (f) => { if (!(f in files)) throw new Error(`ENOENT: ${f}`); return typeof files[f] === 'string' ? files[f] : JSON.stringify(files[f]); },
    stdout: (s) => out.push(s), stderr: (s) => err.push(s), nowUtc: () => NOW
  };
}
const sealed = (fn) => { const p = load(); fn(p); return reseal(p); };

test('exit 0 and OK for the accepted fixture', () => {
  const x = io({ 'p.json': load() });
  assert.equal(main(['p.json'], x), 0);
  assert.match(x.out.join('\n'), /^OK /);
});

test('exit 1 and one line per finding as CODE path: message', () => {
  const x = io({ 'p.json': sealed((p) => { p.options[0].os = 'Windows'; }) });
  assert.equal(main(['p.json'], x), 1);
  assert.match(x.out.join('\n'), /^OPTION_OS options\[0\]\.os: .+/m);
  assert.match(x.out.join('\n'), /1 finding/);
});

test('exit 2 for no arguments, an unknown flag, a missing file, bad JSON and a bad date', () => {
  assert.equal(main([], io()), 2);
  assert.equal(main(['--nope', 'p.json'], io({ 'p.json': {} })), 2);
  assert.equal(main(['absent.json'], io()), 2);
  assert.equal(main(['p.json'], io({ 'p.json': '{not json' })), 2);
  assert.equal(main(['p.json', '--now', 'tomorrow'], io({ 'p.json': load() })), 2);
  assert.equal(main(['p.json', '--now'], io({ 'p.json': load() })), 2);
  assert.equal(main(['p.json', '--markdown'], io({ 'p.json': load() })), 2);
});

test('--help prints the usage and exits 0', () => {
  const x = io();
  assert.equal(main(['--help'], x), 0);
  assert.match(x.out.join('\n'), /Usage: node testing\\quality\\validate-packet\.cjs/);
});

test('a result file with packet and packetMarkdown is unwrapped and its markdown is checked', () => {
  const p = load();
  const md = ['# packet', p.integrity.packetSha256, '$5.00 $15.00 $75.00', '## 0a. State of the repository at HEAD'].join('\n');
  assert.equal(main(['r.json'], io({ 'r.json': { packet: p, packetMarkdown: md } })), 0);
  const bad = io({ 'r.json': { packet: p, packetMarkdown: 'no hash here' } });
  assert.equal(main(['r.json'], bad), 1);
  assert.match(bad.out.join('\n'), /MARKDOWN_HASH_MISSING/);
});

test('--markdown reads a separate file and --now overrides the clock; stale prices fail', () => {
  const p = load();
  const md = ['# packet', p.integrity.packetSha256, '$5.00 $15.00 $75.00', '## 0a. State of the repository at HEAD'].join('\n');
  assert.equal(main(['p.json', '--markdown', 'p.md'], io({ 'p.json': p, 'p.md': md })), 0);
  const x = io({ 'p.json': p });
  assert.equal(main(['p.json', '--now', '2026-11-20T00:00:00Z'], x), 1);
  assert.match(x.out.join('\n'), /PRICE_STALE_NOW/);
});

test('--json prints the machine-readable result', () => {
  const x = io({ 'p.json': load() });
  assert.equal(main(['p.json', '--json'], x), 0);
  const parsed = JSON.parse(x.out.join('\n'));
  assert.deepEqual(parsed, { ok: true, findings: [] });
});

test('the default clock is the real one: a 2026 packet is stale by then or current, never a crash', () => {
  const x = io({ 'p.json': load() });
  delete x.nowUtc;
  const code = main(['p.json'], x);
  assert.ok(code === 0 || code === 1);
});

function child(args, input) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return spawnSync(process.execPath, [CLI, ...args], { input, env, encoding: 'utf8', timeout: 30000 });
}

test('a real process: exit 0 on stdin, exit 1 on a bad packet, exit 2 without arguments', () => {
  const ok = child(['-', '--now', NOW], JSON.stringify(load()));
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = child(['-', '--now', NOW], JSON.stringify(sealed((p) => { p.status = 'approved'; })));
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /STATUS_NOT_PROPOSAL/);
  const none = child([], '');
  assert.equal(none.status, 2);
  assert.match(none.stderr, /Usage/);
});
