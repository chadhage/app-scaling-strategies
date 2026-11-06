'use strict';

// Gaps that the archived mutation run showed (F4c and F6a, F6b, F6c, F6f, F6g survived): every --json name rule is pinned by
// its OWN reason text with the file system untouched (the generic "cannot be inspected" refusal hid a removed rule), and the
// second digest is compared case-insensitively in both directions.
const assert = require('node:assert/strict');
const test = require('node:test');
const cli = require('../cli.cjs');
const { qualifyEdge } = require('../qualify.cjs');
const { fixtureAdapters, SHA } = require('./support.cjs');

const sink = () => ({ text: '', write(chunk) { this.text += chunk; } });
const touched = [];
const trapFs = { lstatSync(file) { touched.push(file); throw new Error('the file system must not be touched'); }, statSync(file) { touched.push(file); throw new Error('the file system must not be touched'); } };

const RULES = [
  ['', /: it is empty\n$/],
  ['a\u0000b.json', /: it contains a control or wildcard character\n$/], ['a\u001Fb.json', /: it contains a control or wildcard character\n$/],
  ['a*b.json', /: it contains a control or wildcard character\n$/], ['a|b.json', /: it contains a control or wildcard character\n$/],
  ['\\\\server\\share\\x.json', /: UNC and device paths are not allowed\n$/], ['//server/share/x.json', /: UNC and device paths are not allowed\n$/],
  ['x.json.', /: the name "x\.json\." ends with a dot or a space\n$/], ['dir \\x.json', /: the name "dir " ends with a dot or a space\n$/],
  ['x.json ', /: the name "x\.json " ends with a dot or a space\n$/],
  ['nul.json', /: "nul\.json" is a reserved device name\n$/], ['dir\\CON', /: "CON" is a reserved device name\n$/], ['com1', /: "com1" is a reserved device name\n$/],
  ['lpt9.txt', /: "lpt9\.txt" is a reserved device name\n$/], ['CONIN$', /: "CONIN\$" is a reserved device name\n$/],
  ['tracked.json:evil', /: a colon after the drive letter would address an alternate data stream\n$/],
];

test('every name rule refuses with its own reason and without touching the file system', async () => {
  for (const [target, reason] of RULES) {
    const [out, err] = [sink(), sink()];
    const code = await cli.main(['--json', target], { stdout: out, stderr: err, fs: trapFs, qualify: async () => { throw new Error('must not run'); } });
    assert.equal(code, 2, JSON.stringify(target));
    assert.equal(out.text, '');
    assert.match(err.text, reason, JSON.stringify(target));
  }
  assert.deepEqual(touched, []);
});

test('the second digest is compared without regard to letter case, whichever read is upper case', { timeout: 30000 }, async () => {
  const queue = (...list) => { const rest = [...list]; return () => rest.shift(); };
  for (const [first, second] of [[SHA, SHA.toUpperCase()], [SHA.toUpperCase(), SHA], [SHA.toUpperCase(), SHA.toUpperCase()]]) {
    const report = await qualifyEdge({ adapters: fixtureAdapters({ sha256: queue(first, second) }) });
    assert.equal(report.ok, true, `${first} ${second}`);
    assert.equal(report.sha256, SHA);
  }
});
