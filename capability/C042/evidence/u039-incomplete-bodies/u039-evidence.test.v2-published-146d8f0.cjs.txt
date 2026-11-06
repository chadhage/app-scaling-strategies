'use strict';

// U039: the amendment chain of the sealed card C042 and the evidence archived for it, verified WITHOUT git (the accepted tree is
// pinned inside evidence-addendum-1.json). `verify` is a pure function over an injected file system, so the tamper tests run the
// same check on an in-memory copy: any change to a pinned byte, an unlisted addition, a broken chain or a doctored transcript
// must produce a named problem. Not detectable by any in-tree test: a CONSISTENT rewrite of an archive, its manifest and the
// addendum together; the accepted commit 6e088f54 and its tag are the only anchor for that (README U039.md says so).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const zlib = require('node:zlib');
const lib = require('./u039-lib.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const NS = 'capability/C042';
const EVIDENCE = `${NS}/evidence/u039-pipelining`;
const AMENDABLE = [`${NS}/README.md`, `${NS}/server.cjs`];
const ACCEPTED = { [`${NS}/server.cjs`]: '2503ad0fbd1455810068c03386061d57100e4ad97a7635923bb220ea7dbb16f2', [`${NS}/README.md`]: '661045e34f410b805f21d8bfbb4cc2e1cec1302a34c5734ea89ca4d2cdbe4c65' };
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lfOf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
// A pin holds for the raw bytes or for the same bytes with CRLF turned into LF (a tree converted by a checkout or a tool). An unconverted
// file must match BOTH digests (a doctored canonical digest is caught); a converted one matches the canonical form.
const same = (bytes, rawDigest, lfDigest) => {
  const digest = sha(bytes);
  if (digest === rawDigest) return lfDigest === undefined || sha(lfOf(bytes)) === lfDigest;
  return lfDigest !== undefined && (digest === lfDigest || sha(lfOf(bytes)) === lfDigest);
};
const ACCEPTED_LF = { [`${NS}/server.cjs`]: '3949f39bb5199ea870718cfc5518d5fc922a23a9a7c3aae799d9acf0656f824d', [`${NS}/README.md`]: '6dbbd833d131b38dff1718d4af4b238d73b47a30680d13e72695facecd0af297' };
const IGNORED = (name) => name.startsWith(`${NS}/tests/scratch/`) || name.startsWith(`${NS}/data/`);

function walk(directory, prefix = NS) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? walk(path.join(directory, entry.name), name) : [name];
  }).filter((name) => !IGNORED(name));
}
const realFs = () => ({ files: walk(root), read: (name) => (fs.existsSync(path.join(repository, name)) ? fs.readFileSync(path.join(repository, name)) : null) });
const memoryFs = (map) => ({ files: [...map.keys()], read: (name) => map.get(name) ?? null });
const snapshot = () => { const real = realFs(); return new Map(real.files.map((name) => [name, real.read(name)])); };
// Every attempt an addendum lists as retained (failed or superseded: its transcripts stay pinned, its inputs are not compared), over the whole chain.
function retainedNames() {
  const names = new Set();
  for (let sequence = 1; fs.existsSync(path.join(root, `evidence-addendum-${sequence}.json`)); sequence += 1) {
    for (const name of JSON.parse(fs.readFileSync(path.join(root, `evidence-addendum-${sequence}.json`), 'utf8')).retainedAttempts ?? []) names.add(name);
  }
  return names;
}

function verify({ files, read }) {
  const problems = [];
  const add = (text) => problems.push(text);
  const addenda = [];
  for (let sequence = 1; ; sequence += 1) {
    const bytes = read(`${NS}/evidence-addendum-${sequence}.json`);
    if (bytes === null) break;
    let json;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { add(`addendum ${sequence} is not JSON`); break; }
    addenda.push({ json, bytes });
    if (json.schema !== 'C042-evidence-addendum/1' || json.cardId !== 'C042' || json.item !== 'U039' || json.sequence !== sequence) add(`addendum ${sequence} has a wrong identity`);
    const before = sequence === 1 ? null : addenda[sequence - 2].bytes;
    const linked = sequence === 1 ? json.previous === null : json.previous?.path === `${NS}/evidence-addendum-${sequence - 1}.json` && same(before, json.previous.rawSha256, json.previous.canonicalLfSha256);
    if (!linked) add(`addendum ${sequence} does not chain to its predecessor by raw SHA-256`);
  }
  if (addenda.length === 0) return ['no addendum'];
  const first = addenda[0].json;
  const listed = new Set([...Object.keys(first.base?.files ?? {})]);
  if (first.base?.commit !== '6e088f54beed052bba20e0910f49aca1d583d293' || first.base?.tag !== 'kanban/C042/6e088f54beed') add('the accepted commit or tag changed');
  if (JSON.stringify(first.amendable) !== JSON.stringify(AMENDABLE)) add('the amendable list is not exactly server.cjs and README.md');
  const amended = new Map();
  for (const item of first.amendments ?? []) {
    amended.set(item.path, item);
    if (!AMENDABLE.includes(item.path)) add(`${item.path} is not amendable`);
    if (item.previousRawSha256 !== ACCEPTED[item.path] || item.previousRawSha256 !== first.base.files[item.path] || item.previousCanonicalLfSha256 !== ACCEPTED_LF[item.path]) add(`${item.path}: previous bytes are not the accepted bytes`);
    const retained = read(item.retained);
    if (retained === null || !same(retained, item.previousRawSha256, item.previousCanonicalLfSha256)) add(`${item.path}: the retained accepted bytes changed`);
    const current = read(item.path);
    if (current === null || !same(current, item.rawSha256, item.canonicalLfSha256)) add(`${item.path}: the amended bytes changed after the addendum`);
  }
  if ([...amended.keys()].sort().join() !== AMENDABLE.join()) add('the amendments do not cover exactly the amendable files');
  for (const [name, digest] of Object.entries(first.base?.files ?? {})) {
    if (amended.has(name)) continue;
    const bytes = read(name);
    if (bytes === null) add(`${name}: a sealed file is missing`);
    else if (!same(bytes, digest, first.base.canonicalLfFiles?.[name])) add(`${name}: a sealed file changed`);
  }
  const pinned = new Map();
  for (const { json } of addenda) for (const item of [...(json.evidence ?? []), ...(json.added ?? [])]) {
    if (pinned.has(item.path)) add(`${item.path} is indexed twice`);
    pinned.set(item.path, item.rawSha256);
    const bytes = read(item.path);
    if (bytes === null) add(`${item.path}: an indexed file is missing`);
    else if (!same(bytes, item.rawSha256, item.canonicalLfSha256)) add(`${item.path}: an indexed file changed`);
  }
  const addendumNames = new Set(addenda.map((_, index) => `${NS}/evidence-addendum-${index + 1}.json`));
  // Evidence archived after the newest addendum is pinned by the NEXT one; U039.md (numbers and results) is pinned by addendum 2.
  for (const name of files) if (!name.startsWith(`${EVIDENCE}/`) && name !== `${NS}/U039.md` && !listed.has(name) && !pinned.has(name) && !addendumNames.has(name)) add(`${name}: an unlisted addition`);
  if (addenda.length >= 2 && !pinned.has(`${NS}/U039.md`)) add('U039.md is not pinned by the newest addendum');
  const retained = new Set(addenda.flatMap(({ json }) => json.retainedAttempts ?? []));
  const superseded = new Set([...amended.values()].flatMap((item) => [item.previousRawSha256, item.previousCanonicalLfSha256]));
  for (const name of files.filter((file) => file.startsWith(`${EVIDENCE}/`) && /\/[^/]+\.json$/.test(file) && !file.includes('/raw/'))) {
    let manifest;
    try { manifest = JSON.parse(read(name).toString('utf8')); } catch { add(`${name}: a manifest is not JSON`); continue; }
    for (const stream of ['stdout', 'stderr']) {
      const gz = read(`${EVIDENCE}/${manifest.transcripts[stream].path.replaceAll('\\', '/')}`);
      if (gz === null || sha(gz) !== manifest.transcripts[stream].gzipSha256 || sha(zlib.gunzipSync(gz)) !== manifest.transcripts[stream].sha256) add(`${manifest.name}: the ${stream} transcript changed`);
    }
    if (retained.has(manifest.name)) continue;
    for (const input of manifest.inputs) {
      const current = read(input.path.replaceAll('\\', '/'));
      if (current === null || (!same(current, input.rawSha256, input.crlfToLfSha256) && !superseded.has(input.rawSha256))) add(`${manifest.name}: input ${input.path} differs from its pin`);
    }
  }
  return problems;
}

test('the addendum chain, the sealed tree and every archived run verify against the pinned bytes', () => {
  assert.deepEqual(verify(realFs()), []);
});

test('the amended files are exactly server.cjs and README.md, and everything else of the accepted tree is byte-identical', () => {
  const files = new Map([...snapshot()]);
  const first = JSON.parse(files.get(`${NS}/evidence-addendum-1.json`).toString('utf8'));
  assert.equal(Object.keys(first.base.files).length >= 80, true, 'the accepted tree has its files pinned');
  assert.deepEqual(first.amendments.map((item) => item.path), AMENDABLE);
  for (const item of first.amendments) assert.notEqual(item.previousRawSha256, item.rawSha256, `${item.path} really changed`);
  assert.equal(same(files.get(`${NS}/contract.js`), first.base.files[`${NS}/contract.js`], first.base.canonicalLfFiles[`${NS}/contract.js`]), true, 'contract.js (pinned by C043 and C059) is untouched (raw or LF form)');
});

const tamper = (name, change, expected) => test(`tamper: ${name} is detected`, () => {
  const files = snapshot();
  change(files);
  const problems = verify(memoryFs(files));
  assert.equal(problems.some((problem) => expected.test(problem)), true, `${expected} not in ${JSON.stringify(problems.slice(0, 5))}`);
});
const flip = (files, name) => { const bytes = Buffer.from(files.get(name)); bytes[bytes.length >> 1] ^= 1; files.set(name, bytes); };
const first = (files, pattern) => [...files.keys()].find((name) => pattern.test(name));
tamper('one byte of server.cjs', (files) => flip(files, `${NS}/server.cjs`), /server\.cjs: the amended bytes changed/);
tamper('one byte of README.md', (files) => flip(files, `${NS}/README.md`), /README\.md: the amended bytes changed/);
tamper('one byte of the retained accepted server bytes', (files) => flip(files, `${EVIDENCE}/server.v1.cjs.txt`), /retained accepted bytes changed|an indexed file changed/);
tamper('one byte of a sealed file (contract.js)', (files) => flip(files, `${NS}/contract.js`), /contract\.js: a sealed file changed/);
tamper('one byte of a sealed test (surface.test.cjs)', (files) => flip(files, `${NS}/tests/surface.test.cjs`), /surface\.test\.cjs: a sealed file changed/);
tamper('a deleted sealed file', (files) => files.delete(`${NS}/engine.cjs`), /engine\.cjs: a sealed file is missing/);
tamper('an added file (a shadowing module)', (files) => files.set(`${NS}/node_modules/x/index.js`, Buffer.from('x')), /an unlisted addition/);
tamper('an added package.json', (files) => files.set(`${NS}/package.json`, Buffer.from('{"type":"module"}')), /package\.json: an unlisted addition/);
tamper('one byte of a U039 test', (files) => flip(files, `${NS}/tests/u039-rows.cjs`), /u039-rows\.cjs: an indexed file changed|differs from its pin/);
tamper('one byte of an archived stdout transcript', (files) => flip(files, first(files, /evidence\/u039-pipelining\/raw\/red-01-head-bytes\.stdout\.raw\.gz$/)), /transcript changed|an indexed file changed/);
tamper('a missing archived manifest', (files) => files.delete(`${EVIDENCE}/red-01-head-bytes.json`), /an indexed file is missing/);
tamper('a doctored amendment hash in addendum 1 (both digests)', (files) => {
  const json = JSON.parse(files.get(`${NS}/evidence-addendum-1.json`).toString('utf8'));
  json.amendments[0].rawSha256 = '0'.repeat(64);
  json.amendments[0].canonicalLfSha256 = '1'.repeat(64);
  files.set(`${NS}/evidence-addendum-1.json`, Buffer.from(`${JSON.stringify(json, null, 2)}\n`));
}, /amended bytes changed|does not chain/);
tamper('a doctored canonical digest in addendum 1 (the raw digest still matches)', (files) => {
  const json = JSON.parse(files.get(`${NS}/evidence-addendum-1.json`).toString('utf8'));
  json.amendments[1].canonicalLfSha256 = '1'.repeat(64);
  files.set(`${NS}/evidence-addendum-1.json`, Buffer.from(`${JSON.stringify(json, null, 2)}\n`));
}, /amended bytes changed|does not chain/);
// These two need addendum 2 (it pins addendum 1 and U039.md); before it exists U039.md is open and addendum 1 is the newest.
const withSecond = (name, change, expected) => test(`tamper: ${name} is detected once addendum 2 exists`, () => {
  const files = snapshot();
  if (!files.has(`${NS}/evidence-addendum-2.json`)) { assert.deepEqual(verify(memoryFs(files)), [], 'addendum 2 is not written yet: nothing to tamper with'); return; }
  change(files);
  assert.equal(verify(memoryFs(files)).some((problem) => expected.test(problem)), true, `${expected} not reported`);
});
withSecond('an addendum 1 edited without re-pinning addendum 2', (files) => files.set(`${NS}/evidence-addendum-1.json`, Buffer.concat([files.get(`${NS}/evidence-addendum-1.json`), Buffer.from(' ')])), /does not chain to its predecessor/);
tamper('a missing addendum 1', (files) => files.delete(`${NS}/evidence-addendum-1.json`), /no addendum/);
tamper('one byte of U039.feature', (files) => flip(files, `${NS}/U039.feature`), /U039\.feature: an indexed file changed/);
withSecond('one byte of U039.md (pinned by the newest addendum)', (files) => flip(files, `${NS}/U039.md`), /U039\.md: an indexed file changed/);
tamper('one byte of an archived manifest', (files) => flip(files, `${EVIDENCE}/red-01-head-bytes.json`), /an indexed file changed|a manifest is not JSON|transcript changed/);
tamper('a deleted evidence .gitattributes', (files) => files.delete(`${EVIDENCE}/.gitattributes`), /\.gitattributes: an indexed file is missing/);

const TEXT = /\.(?:c?js|json|md|feature|txt|html|css)$|\.git(?:attributes|ignore)$/;
const converted = (convert) => { const files = snapshot(); for (const [name, bytes] of files) if (TEXT.test(name) && !name.includes('/raw/')) files.set(name, convert(bytes)); return files; };
test('a tree converted to LF, and one converted to CRLF, verifies the same: no pin is raw-only', () => {
  assert.deepEqual(verify(memoryFs(converted((bytes) => lfOf(bytes)))), []);
  assert.deepEqual(verify(memoryFs(converted((bytes) => Buffer.from(lfOf(bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1')))), []);
});

test('the README states the new rule, the accepted README did not, and U039.md quotes the figures of the archived RED and GREEN', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const accepted = fs.readFileSync(path.join(root, 'evidence', 'u039-pipelining', 'README.v1.md.txt'), 'utf8');
  assert.match(readme, /EVERY refusal/);
  assert.match(readme, /a request pipelined behind a refusal never runs/);
  assert.doesNotMatch(accepted, /pipelined behind a refusal/);
  const dir = path.join(root, 'evidence', 'u039-pipelining');
  const stdout = (name) => zlib.gunzipSync(fs.readFileSync(path.join(dir, 'raw', `${name}.stdout.raw.gz`))).toString('utf8');
  const notes = fs.readFileSync(path.join(root, 'U039.md'), 'utf8');
  const figure = /# U039 matrix: (\d+) variants; (\d+) with a request behind a refusal; (\d+) applied behind a refusal \((\d+) hidden from the client\); (\d+) left the connection open/;
  const retained = retainedNames();
  const kept = (name) => !retained.has(name.replace(/\.json$/, ''));
  const reds = fs.readdirSync(dir).filter((name) => /^red-\d+-final.*\.json$/.test(name) && kept(name));
  const greens = fs.readdirSync(dir).filter((name) => /^green-\d+-.*\.json$/.test(name) && kept(name));
  if (process.env.U039_STRICT_EVIDENCE === '1') {
    assert.equal(reds.length >= 1 && greens.length >= 1, true, 'a final RED and a GREEN are archived');
    for (const name of reds) {
      const [, variants, behind, applied, hidden, open] = figure.exec(stdout(name.replace(/\.json$/, '')));
      assert.equal(notes.includes(`RED figures: ${variants} variants, ${behind} with a request behind a refusal, ${applied} applied behind a refusal (${hidden} hidden), ${open} left open`), true, `U039.md quotes the figures of ${name}`);
    }
    const [, variants, behind] = figure.exec(stdout(greens[0].replace(/\.json$/, '')));
    assert.equal(notes.includes(`GREEN figures: ${variants} variants, ${behind} with a request behind a refusal, 0 applied behind a refusal (0 hidden), 0 left open`), true, 'U039.md quotes the GREEN figures');
  }
});

test('the archived RED is behavioral (assertions about answers, state and closed connections) and the GREEN runs passed', () => {
  const read = (name) => zlib.gunzipSync(fs.readFileSync(path.join(repository, EVIDENCE, 'raw', name))).toString('utf8');
  const retained = retainedNames();
  const current = (name) => !retained.has(name.replace(/\.json$/, ''));
  const manifests = fs.readdirSync(path.join(root, 'evidence', 'u039-pipelining')).filter((name) => /^(red|green|tree)-.*\.json$/.test(name) && current(name));
  assert.equal(manifests.some((name) => name.startsWith('red-')), true);
  if (process.env.U039_STRICT_EVIDENCE === '1') {
    const names = fs.readdirSync(path.join(root, 'evidence', 'u039-pipelining')).filter((name) => name.endsWith('.json') && current(name));
    for (const [pattern, count] of [[/^red-\d+-final/, 1], [/^green-\d+-/, 3], [/^coverage-\d+-final/, 1], [/^mutants-\d+-/, 1], [/^mutants-gen-\d+-/, 1], [/^loop-\d+-/, 1], [/^browser-\d+-/, 1]]) {
      assert.equal(names.filter((name) => pattern.test(name)).length >= count, true, `strict evidence: ${pattern} needs ${count} archived run(s)`);
    }
  }
  for (const name of manifests) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'u039-pipelining', name), 'utf8'));
    const out = read(`${manifest.name}.stdout.raw.gz`);
    assert.equal(manifest.exitCode, manifest.expectedExitCode, manifest.name);
    if (manifest.name.startsWith('tree-')) {
      // A scratch tree with converted line endings (and the accepted bytes alone, for the baseline): the ONLY failure is the sealed surface.test.cjs test that
      // pins the raw bytes of sealed RED evidence. It fails identically on the accepted bytes alone, so no U039 file adds a failure in a converted tree.
      assert.equal(manifest.exitCode, 1, manifest.name);
      assert.equal(manifest.summary.fail, 1, manifest.name);
      assert.equal(manifest.summary.pass, manifest.summary.tests - 1, manifest.name);
      assert.deepEqual(manifest.summary.notOk, ['the retained RED is behavioral, was archived before any production file existed, and its inputs are unchanged'], manifest.name);
    } else if (/^red-\d+-lane/.test(manifest.name)) {
      // The third-hole RED: the lane tests and the ordering test against the retained first fix. Only a parse error or CONNECT behind two or more earlier requests fails there.
      const failing = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim());
      assert.equal(manifest.exitCode, 1);
      assert.equal(failing.length >= 48, true, `${manifest.name}: ${failing.length} failing tests`);
      assert.equal(failing.every((title) => /^lane .* \[(?:GGX|GGGX|GGXG|PGX)\] (?:parse-error|connect):|^a parse error answers the requests queued before it/.test(title)), true, `${manifest.name}: ${failing.join(' | ').slice(0, 300)}`);
      assert.equal((out.match(/code: 'ERR_ASSERTION'/g) ?? []).length >= failing.length, true, `${manifest.name}: every failure is an assertion`);
      assert.doesNotMatch(out, /TypeError|ReferenceError|SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND/);
    } else if (manifest.name.startsWith('red-')) {
      assert.equal(manifest.exitCode, 1);
      assert.equal((out.match(/code: 'ERR_ASSERTION'/g) ?? []).length >= 100, true, `${manifest.name}: assertion failures`);
      assert.doesNotMatch(out, /TypeError|ReferenceError|SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND/);
      assert.match(out, /# U039 matrix: \d+ variants; \d+ with a request behind a refusal; [1-9]\d* applied behind a refusal/);
    } else {
      assert.equal(manifest.summary.fail, 0, manifest.name);
      assert.equal(manifest.summary.pass, manifest.summary.tests, manifest.name);
      assert.match(out, /# U039 matrix: \d+ variants; \d+ with a request behind a refusal; 0 applied behind a refusal \(0 hidden from the client\); 0 left the connection open/);
    }
  }
});

test('the RED replays against the archived accepted bytes: the ordering tests fail on them', { timeout: 1000000 }, () => {
  const env = lib.childEnv({ U039_SUBJECT: 'v1', U039_CLOSE_MS: '1500' });
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const red = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join('capability', 'C042', 'tests', 'u039-ordering.test.cjs')], { cwd: repository, env, encoding: 'utf8', timeout: 900000, windowsHide: true });
  assert.equal(red.status, 1);
  assert.equal((red.stdout.match(/^not ok \d+ - /gm) ?? []).length >= 6, true, red.stdout.slice(-400));
  assert.doesNotMatch(red.stdout, /TypeError|ReferenceError|Cannot find module/);
});

test('the third-hole RED replays against the retained first-fix bytes: a parse error and CONNECT behind two earlier requests fail on them', { timeout: 1000000 }, () => {
  const env = lib.childEnv({ U039_SUBJECT: `file:${EVIDENCE}/server.v2-first-fix.cjs.txt`, U039_CLOSE_MS: '1500' });
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const red = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern=\\[GGX\\] (parse-error|connect):', path.join('capability', 'C042', 'tests', 'u039-lane.test.cjs')], { cwd: repository, env, encoding: 'utf8', timeout: 900000, windowsHide: true });
  assert.equal(red.status, 1);
  assert.equal((red.stdout.match(/^not ok \d+ - lane .* \[GGX\] (?:parse-error|connect):/gm) ?? []).length, 12, red.stdout.slice(-400));
  assert.doesNotMatch(red.stdout, /TypeError|ReferenceError|Cannot find module/);
});
