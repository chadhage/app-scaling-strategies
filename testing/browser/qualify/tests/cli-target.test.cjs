'use strict';

// F6 of the independent review: the --json target is checked BEFORE anything runs. Windows reserved device names,
// trailing dots and spaces and any colon after the drive letter are refused (they create files that plain Windows tools
// cannot delete, or attach an NTFS alternate data stream to an existing file), and an existing target fails in seconds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const cli = require('../cli.cjs');
const { fixtureAdapters } = require('./support.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');

const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const GOOD = { ok: true, version: '156.0.4314.58', path: 'p', major: 156, sha256: 's', signature: { publisher: 'Microsoft Corporation' } };
const enoent = () => Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
const untouchedFs = { lstatSync() { throw new Error('the file system must not be touched'); }, statSync() { throw new Error('the file system must not be touched'); } };
const absentFs = { lstatSync() { throw enoent(); }, statSync: () => ({ isDirectory: () => true }) };

async function attempt(target, io = {}) {
  const calls = { qualify: 0, requalify: 0, write: 0 };
  const [out, err] = [sink(), sink()];
  const code = await cli.main(['--json', target], {
    stdout: out, stderr: err, fs: untouchedFs,
    qualify: async () => { calls.qualify += 1; return GOOD; },
    requalify: async () => { calls.requalify += 1; return GOOD; },
    writeFile: () => { calls.write += 1; },
    ...io,
  });
  return { code, out: out.text, err: err.text, calls };
}

const REFUSED = [
  ['', 'empty'], ['x.json.', 'trailing dot'], ['x.json...', 'trailing dots'], ['x.json ', 'trailing space'], ['x.json. ', 'dot and space'],
  ['dir.\\x.json', 'trailing dot in a folder name'], ['dir \\x.json', 'trailing space in a folder name'], ['a/b./c.json', 'forward slashes'],
  ['nul.json', 'reserved NUL'], ['NUL', 'reserved NUL, no extension'], ['con', 'reserved CON'], ['Con.txt', 'reserved CON, mixed case'],
  ['prn.x', 'reserved PRN'], ['aux', 'reserved AUX'], ['com1', 'reserved COM1'], ['COM9.log', 'reserved COM9'], ['lpt1', 'reserved LPT1'],
  ['LPT9.json', 'reserved LPT9'], ['dir\\nul.json', 'reserved in a folder'], ['nul\\x.json', 'reserved folder'], ['aux.x.y', 'reserved before the first dot'],
  ['CONIN$', 'reserved CONIN$'], ['conout$.json', 'reserved CONOUT$'], ['COM\u00B9', 'reserved COM superscript one'], ['lpt\u00B2.txt', 'reserved LPT superscript two'],
  ['tracked.json:evil', 'alternate data stream'], ['tracked.json::$DATA', 'default data stream'], ['C:\\a\\b.json:s', 'stream after a drive path'],
  ['ab:c.json', 'colon after a longer prefix'], ['1:x.json', 'digit before the colon'], ['\\\\?\\C:\\x.json', 'extended-length prefix'],
  ['\\\\server\\share\\x.json', 'UNC path'], ['//server/share/x.json', 'UNC path with forward slashes'], ['\\\\.\\nul', 'device path'],
  ['a*.json', 'wildcard star'], ['a?.json', 'wildcard question mark'], ['a<b.json', 'less-than'], ['a>b.json', 'greater-than'],
  ['a|b.json', 'pipe'], ['a"b.json', 'quote'], ['a\u0000b.json', 'NUL character'], ['a\nb.json', 'line break'], ['a\u001Fb.json', 'control character'],
];

test('a --json target that Windows tools cannot handle is refused before anything runs, with one stderr line and exit 2', async () => {
  for (const [target, why] of REFUSED) {
    for (const flags of [[], ['--requalify']]) {
      const calls = { qualify: 0, requalify: 0, write: 0 };
      const [out, err] = [sink(), sink()];
      const code = await cli.main([...flags, '--json', target], {
        stdout: out, stderr: err, fs: untouchedFs,
        qualify: async () => { calls.qualify += 1; return GOOD; }, requalify: async () => { calls.requalify += 1; return GOOD; },
        writeFile: () => { calls.write += 1; },
      });
      const label = `${why} ${JSON.stringify(target)} ${flags.join(' ')}`;
      assert.equal(code, 2, label);
      assert.equal(out.text, '', label);
      assert.match(err.text, /^invalid --json target "[^\n]*": [^\n]+\n$/, label);
      assert.deepEqual(calls, { qualify: 0, requalify: 0, write: 0 }, label);
    }
  }
});

test('ordinary relative and absolute targets are accepted, including navigation segments and look-alike names', async () => {
  const fine = [
    'out.json', 'evidence\\qualification\\report.json', 'evidence/qualification/report.json', '.\\out.json', '..\\out.json', 'a\\.\\b.json',
    '.hidden.json', 'a b.json', 'C:\\work\\report.json', 'C:report.json', 'console.json', 'nullable.json', 'com10.json', 'com.json', 'lpt.json',
    'aux1.json', 'connect', 'prn1.txt', 'x.nul', 'report.2026-11-05.json',
  ];
  for (const target of fine) {
    const result = await attempt(target, { fs: absentFs });
    assert.equal(result.code, 0, target);
    assert.deepEqual(result.calls, { qualify: 1, requalify: 0, write: 1 }, target);
    assert.equal(result.err.split('\n').length, 2, target);
  }
});

test('an existing target, a missing folder and a folder in place of the file fail early with exit 2 and nothing started', async () => {
  const dir = scratchDir();
  try {
    const target = path.join(dir, 'report.json');
    fs.writeFileSync(target, 'precious');
    for (const flags of [[], ['--requalify']]) {
      const calls = { qualify: 0, requalify: 0, write: 0 };
      const [out, err] = [sink(), sink()];
      const code = await cli.main([...flags, '--json', target], {
        stdout: out, stderr: err, qualify: async () => { calls.qualify += 1; return GOOD; }, requalify: async () => { calls.requalify += 1; return GOOD; },
        writeFile: () => { calls.write += 1; },
      });
      assert.equal(code, 2, flags.join(' '));
      assert.equal(out.text, '');
      assert.equal(err.text, `cannot write ${JSON.stringify(target)}: the file already exists, --json never overwrites\n`);
      assert.deepEqual(calls, { qualify: 0, requalify: 0, write: 0 });
    }
    assert.equal(fs.readFileSync(target, 'utf8'), 'precious');
    const missing = await attempt(path.join(dir, 'no-such-folder', 'report.json'), { fs });
    assert.equal(missing.code, 2);
    assert.match(missing.err, /^invalid --json target ".*report\.json": the folder does not exist\n$/);
    assert.deepEqual(missing.calls, { qualify: 0, requalify: 0, write: 0 });
    const folder = await attempt(dir, { fs });
    assert.equal(folder.code, 2);
    assert.match(folder.err, /^cannot write ".*": the file already exists/);
  } finally {
    removeDir(dir);
  }
});

test('an alternate data stream is never attached to an existing file', async () => {
  const dir = scratchDir();
  try {
    const target = path.join(dir, 'tracked.json');
    fs.writeFileSync(target, 'tracked content');
    const result = await attempt(`${target}:evil`, { fs, qualify: undefined, writeFile: undefined, qualifyOptions: { adapters: fixtureAdapters() } });
    assert.equal(result.code, 2);
    assert.match(result.err, /colon/);
    assert.throws(() => fs.readFileSync(`${target}:evil`), { code: 'ENOENT' });
    assert.equal(fs.readFileSync(target, 'utf8'), 'tracked content');
    assert.deepEqual(fs.readdirSync(dir), ['tracked.json']);
  } finally {
    removeDir(dir);
  }
});

test('a real run still writes the report once, and a second run with the same target fails early', async () => {
  const dir = scratchDir();
  try {
    const target = path.join(dir, 'report.json');
    const qualifyOptions = { adapters: fixtureAdapters() };
    const first = await attempt(target, { fs, qualify: undefined, writeFile: undefined, qualifyOptions });
    assert.equal(first.code, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), first.out);
    const second = await attempt(target, { fs, qualify: undefined, writeFile: undefined, qualifyOptions });
    assert.equal(second.code, 2);
    assert.equal(second.out, '');
    assert.equal(fs.readFileSync(target, 'utf8'), first.out);
  } finally {
    removeDir(dir);
  }
});
