'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cli = require('../cli.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');

const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const qualifyOptions = (overrides) => ({ adapters: fixtureAdapters(overrides) });

test('arguments are parsed strictly and every misuse is a named usage error', () => {
  assert.deepEqual(cli.parseArgs([]).options, { json: null, requalify: false, help: false, slotScript: null, slotOwner: null });
  assert.equal(cli.parseArgs(['--json', 'out.json', '--requalify']).options.json, 'out.json');
  assert.equal(cli.parseArgs(['-h']).options.help, true);
  const slot = cli.parseArgs(['--requalify', '--slot-script', 'S.ps1', '--slot-owner', 'U018']).options;
  assert.deepEqual([slot.slotScript, slot.slotOwner], ['S.ps1', 'U018']);
  const refused = [
    [['--bogus'], /unknown argument "--bogus"/], [['positional'], /unknown argument/], [['--json'], /--json needs a value/],
    [['--json', '--requalify'], /--json needs a value/], [['--json', 'a', '--json', 'b'], /given twice/],
    [['--requalify', '--slot-script', 'S.ps1'], /go together/], [['--requalify', '--slot-owner', 'x'], /go together/],
    [['--slot-script', 'S.ps1', '--slot-owner', 'x'], /need --requalify/], [['__proto__'], /unknown argument/],
  ];
  for (const [argv, message] of refused) assert.match(cli.parseArgs(argv).error, message, argv.join(' '));
});

test('the verdict line names the identity on a pass and every reason on a failure', () => {
  const pass = { ok: true, version: '156.0.4314.58', path: 'C:\\e.exe', major: 156, sha256: 'ab', signature: { publisher: 'Microsoft Corporation' } };
  assert.match(cli.verdict(pass), /^PASS Edge 156\.0\.4314\.58 at C:\\e\.exe: signed by Microsoft Corporation, major 156 qualified, sha256 ab$/);
  const requalified = { ...pass, requalification: { ran: true, totals: { pass: 5, tests: 5 } } };
  assert.match(cli.verdict(requalified), /isolated suites 5\/5 passed$/);
  const fail = { ok: false, reasons: ['A: x', 'B: y'] };
  assert.equal(cli.verdict(fail), 'FAIL closed: A: x | B: y');
  assert.equal(cli.verdict({ ...fail, requalification: { ran: true, totals: { pass: 3, tests: 4 } } }), 'FAIL closed: A: x | B: y (isolated suites 3/4 passed)');
  assert.equal(cli.verdict({ ...fail, requalification: { ran: false } }), 'FAIL closed: A: x | B: y');
});

test('a qualified Edge exits 0 with the JSON report on stdout and one verdict line on stderr', async () => {
  const [out, err] = [sink(), sink()];
  const code = await cli.main([], { stdout: out, stderr: err, qualifyOptions: qualifyOptions() });
  assert.equal(code, 0);
  const report = JSON.parse(out.text);
  assert.equal(report.ok, true);
  assert.equal(report.version, '156.0.4314.58');
  assert.match(err.text, /^PASS Edge 156\.0\.4314\.58/);
  assert.equal(err.text.trim().split('\n').length, 1);
});

test('a failure exits 1 and says why, and the check itself failing is also a failure', async () => {
  const [out, err] = [sink(), sink()];
  const code = await cli.main([], { stdout: out, stderr: err, qualifyOptions: qualifyOptions({ fileVersion: () => '157.0.1.1' }) });
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(out.text).reasonCodes, ['MAJOR_NOT_QUALIFIED']);
  assert.match(err.text, /^FAIL closed: MAJOR_NOT_QUALIFIED/);
  const crash = sink();
  assert.equal(await cli.main([], { stdout: sink(), stderr: crash, qualify: async () => { throw new Error('boom'); } }), 1);
  assert.match(crash.text, /FAIL closed: the check itself failed: boom/);
});

test('usage errors exit 2 with the usage text and --help exits 0', async () => {
  const [out, err] = [sink(), sink()];
  assert.equal(await cli.main(['--nope'], { stdout: out, stderr: err }), 2);
  assert.match(err.text, /unknown argument "--nope"/);
  assert.match(err.text, /Usage: node testing\\browser\\qualify\\qualify\.cjs/);
  assert.equal(out.text, '');
  const help = sink();
  assert.equal(await cli.main(['--help'], { stdout: help, stderr: sink() }), 0);
  assert.equal(help.text, cli.USAGE);
});

test('--json writes the same report without ever overwriting an existing file', async () => {
  const dir = scratchDir();
  const target = path.join(dir, 'report.json');
  try {
    const [out, err] = [sink(), sink()];
    assert.equal(await cli.main(['--json', target], { stdout: out, stderr: err, qualifyOptions: qualifyOptions() }), 0);
    assert.equal(fs.readFileSync(target, 'utf8'), out.text);
    const [out2, err2] = [sink(), sink()];
    assert.equal(await cli.main(['--json', target], { stdout: out2, stderr: err2, qualifyOptions: qualifyOptions() }), 2);
    assert.match(err2.text, /cannot write .*EEXIST/);
    assert.equal(fs.readFileSync(target, 'utf8'), out.text);
    const injected = [];
    assert.equal(await cli.main(['--json', 'x.json'], { stdout: sink(), stderr: sink(), qualifyOptions: qualifyOptions(), writeFile: (file, data) => injected.push(file, data.length > 0) }), 0);
    assert.deepEqual(injected, ['x.json', true]);
  } finally {
    removeDir(dir);
  }
});

test('--requalify calls the requalification and builds the heavy slot only when it is asked for', async () => {
  const seen = [];
  const requalify = async (options) => { seen.push(options); return { ok: true, version: '1.0.0.0', path: 'p', major: 1, sha256: 's', signature: { publisher: 'Microsoft Corporation' }, requalification: { ran: true, totals: { pass: 2, tests: 2 } } }; };
  assert.equal(await cli.main(['--requalify'], { stdout: sink(), stderr: sink(), requalify, qualifyOptions: { marker: 1 } }), 0);
  assert.equal(seen[0].slot, undefined);
  assert.deepEqual(seen[0].qualifyOptions, { marker: 1 });
  assert.equal(await cli.main(['--requalify', '--slot-script', 'S.ps1', '--slot-owner', 'U018'], { stdout: sink(), stderr: sink(), requalify }), 0);
  assert.equal(typeof seen[1].slot.acquire, 'function');
  assert.equal(typeof seen[1].slot.release, 'function');
});

test('the real command line: --help exits 0 and a usage error exits 2 without starting PowerShell', () => {
  const script = path.join(__dirname, '..', 'qualify.cjs');
  const options = { encoding: 'utf8', timeout: 30000, windowsHide: true };
  const help = spawnSync(process.execPath, [script, '--help'], options);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: node testing\\browser\\qualify\\qualify\.cjs/);
  const bad = spawnSync(process.execPath, [script, '--bogus'], options);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown argument "--bogus"/);
});
