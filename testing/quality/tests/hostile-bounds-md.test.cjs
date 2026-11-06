'use strict';
// V6/V7 hostile sizes and depths (bounded child processes: the validator must answer, never hang or crash) and V8 the markdown copy.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { faithfulMarkdown, sealed, load, reseal, run, assert, test } = require('./hostile.cjs');

const ROOT = path.join(__dirname, '..');
const VALIDATOR = path.join(ROOT, 'packet-validator.cjs').replace(/\\/g, '/');
const CLI = path.join(ROOT, 'validate-packet.cjs');
const clean = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.NODE_V8_COVERAGE; return env; };

// Runs a snippet in a child with a hard timeout; the snippet prints one JSON line { ms, ok, codes } measured inside the child.
function child(body, timeoutMs = 20000) {
  const code = `const { validatePacket } = require('${VALIDATOR}'); const fx = JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8'));
    const t0 = process.hrtime.bigint(); let r; try { r = validatePacket((() => { ${body} })(), { nowUtc: '2026-11-07T12:00:00Z' }); } catch (e) { r = { ok: false, findings: [{ code: 'THREW ' + e.name }] }; }
    console.log(JSON.stringify({ ms: Number(process.hrtime.bigint() - t0) / 1e6, ok: r.ok, codes: [...new Set(r.findings.map((f) => f.code))] }));`;
  const res = spawnSync(process.execPath, ['-e', code, path.join(ROOT, 'fixtures', 'packet-accepted.json')], { env: clean(), encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 1 << 26 });
  assert.equal(res.error, undefined, `the child did not answer within ${timeoutMs} ms`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

for (const [name, body, code] of [
  ['a 200 KB token of letters, digits and e-mail characters', "fx.title = '0123456789abcdef-'.repeat(12500); return fx;", 'INPUT_TOO_LARGE'],
  ['a 5 MB token', "fx.title = '7'.repeat(5000000); return fx;", 'INPUT_TOO_LARGE'],
  ['a 200 KB run of eyJ', "fx.title = 'eyJ'.repeat(66667); return fx;", 'INPUT_TOO_LARGE'],
  ['an array nested 5000 deep', "let a = []; for (let i = 0; i < 5000; i += 1) a = [a]; fx.deep = a; return fx;", 'INPUT_TOO_DEEP'],
  ['an object nested 5000 deep inside the plan', "let a = {}; for (let i = 0; i < 5000; i += 1) a = { a }; fx.cleanupAndRollback.deep = a; return fx;", 'INPUT_TOO_DEEP'],
  ['an array of a million strings', "fx.servesItems = new Array(1000000).fill('x'); return fx;", 'INPUT_TOO_LARGE']
]) {
  test(`V6/V7 ${name} is answered with ${code} in under a second`, () => {
    const out = child(body);
    assert.ok(out.codes.includes(code), `expected ${code}, got ${out.codes.join(', ')}`);
    assert.equal(out.ok, false);
    assert.ok(out.ms < 1000, `took ${out.ms} ms`);
  });
}

const timed = (fn) => { const t0 = process.hrtime.bigint(); const value = fn(); return { value, ms: Number(process.hrtime.bigint() - t0) / 1e6 }; };

for (const [name, mutate] of [
  ['a 15000-character e-mail-like token', (p) => { p.title = 'a1'.repeat(7500); }], ['a 15000-character eyJ run', (p) => { p.title = 'eyJ'.repeat(5000); }],
  ['15000 at signs', (p) => { p.title = '@'.repeat(15000); }], ['15000 spaces between words', (p) => { p.title = `a${' '.repeat(15000)}b`; }], ['15000 hyphenated hex digits', (p) => { p.title = 'ab-'.repeat(5000); }]
]) {
  test(`V7 ${name} is scanned in linear time`, () => {
    const base = timed(() => run(sealed(() => {}))).ms;
    const p = sealed(mutate);
    const { value, ms } = timed(() => run(p));
    assert.ok(ms - base < 1000, `took ${ms} ms against ${base} ms for the plain fixture`);
    assert.equal(typeof value.ok, 'boolean');
  });
}

function cli(stdin) {
  const res = spawnSync(process.execPath, [CLI, '-', '--now', '2026-11-07'], { env: clean(), input: stdin, encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 1 << 26 });
  assert.equal(res.error, undefined, 'the CLI did not answer');
  return res;
}
for (const [name, text] of [
  ['5000-deep nested arrays', () => { const p = JSON.stringify(load()); return `${p.slice(0, -1)},"deep":${'['.repeat(5000)}${']'.repeat(5000)}}`; }],
  ['a 5 MB token', () => `{"title":"${'7'.repeat(5000000)}"}`], ['a million-deep array', () => `${'['.repeat(1000000)}${']'.repeat(1000000)}`], ['malformed JSON', () => '{"a":']
]) {
  test(`V6 the CLI answers ${name} with one line, a non-zero exit and no stack trace`, () => {
    const res = cli(text());
    assert.notEqual(res.status, 0);
    assert.doesNotMatch(`${res.stdout}${res.stderr}`, /\n\s+at |RangeError|TypeError/);
    assert.ok(`${res.stdout}${res.stderr}`.trim().split('\n').length <= 3, 'at most a code line and a count line');
  });
}

// ---- V8: the markdown copy says what the JSON says
const withMd = (edit) => { const p = sealed(() => {}); const md = faithfulMarkdown(p); return run(p, { markdown: edit ? edit(md, p) : md }); };
test('V8 a faithful markdown copy is accepted', () => { const r = withMd(); assert.deepEqual(r.findings.map((f) => f.code), []); });
const BAD = {
  'a three-line markdown with the hash, the ceilings and one heading': (md, p) => [p.integrity.packetSha256, '$5.00 $15.00 $75.00', '## 0a. State of the repository at HEAD'].join('\n'),
  'a missing section heading': (md) => md.replace('## 3. Required resources, costs and exclusions\n', ''), 'a missing Appendix D': (md) => md.replace('## Appendix D. Validation', ''),
  'a ceiling changed next to its option with the right strings appended': (md) => `${md.replace('$5.00', '$50.00')}\n$5.00 $15.00 $75.00`, 'a changed default region': (md) => md.replace('default region eastus', 'default region westus3'),
  'a changed default option': (md) => md.replace('default option A', 'default option C'), 'a missing quota status': (md) => md.replace(/\| failed-2026-11-05 \|/g, '| |'),
  'a missing price expiry': (md) => md.replace('usable until 2026-11-11', 'usable'), 'a missing approvals sentence': (md) => md.replace('approvals.C001 has all six flags false, maximumLiveAzureRuns 0 and authorizedCloudSpend 0.', 'Approved.'),
  'a missing hash': (md, p) => md.split(p.integrity.packetSha256).join('<hash>'), 'a missing allowance sentence': (md, p) => md.replace(p.repositoryState.relationToThisPacket.allowanceVersusBounds, 'none'),
  'a dollar amount the JSON does not contain': (md) => `${md}\nThe plan costs $0.0001 per hour.`, 'an unguarded command in a code block': (md) => md.replace('```powershell', '```powershell\naz group delete --name prod-rg --yes'),
  'an unguarded command in prose': (md) => `${md}\nRun az group delete --name prod-rg --yes now.`, 'a changed command line': (md) => md.replace(' --subscription $Subscription', ''),
  'an approval claim': (md) => `${md}\nThe owner approved option A.`, 'a 32-hex GUID': (md) => `${md}\n11111111222233334444555555555555`, 'a GUID split by emphasis': (md) => `${md}\n11111111-2222-**3333**-4444-555555555555`,
  'a GUID split over two lines': (md) => `${md}\n11111111-2222-3333-\n4444-555555555555`, 'an obfuscated e-mail': (md) => `${md}\nowner [at] example [dot] com`, 'a secret': (md) => `${md}\nAZURE_CLIENT_SECRET=abc123def456`,
  'a decision default turned into yes': (md, p) => md.replace(new RegExp(`(### ${p.ownerDecisions.decisions[0].key}[^\\n]*\\n\\n- Default: \\*\\*)no`), '$1yes')
};
for (const [name, edit] of Object.entries(BAD)) {
  test(`V8 rejects ${name}`, () => {
    const r = withMd(edit);
    assert.equal(r.ok, false, `${name}: accepted`);
    assert.ok(r.findings.some((f) => /^MARKDOWN_|^GUID_FOUND$|^EMAIL_FOUND$|^SECRET_SHAPED$|^DELETE_OUTSIDE_COMMANDS$|^APPROVAL_CLAIM$/.test(f.code)), `${name}: ${r.findings.map((f) => f.code).join(', ')}`);
  });
}
test('V8 the hash in the packet and in a tampered markdown are two different facts', () => {
  const p = sealed(() => {}); reseal(p);
  assert.equal(run(p, { markdown: faithfulMarkdown(p) }).ok, true);
});
