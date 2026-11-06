'use strict';
// Evidence integrity (V12): every manifest of the final evidence (evidence\r3\*) recomputes against the committed files, every transcript matches its hash,
// and a tampered manifest is detected. The historical RED (evidence\r3\red-01) records the pre-fix tests: only its transcripts are checked.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { assert, test } = require('./support.cjs');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..', '..');
const EVIDENCE = path.join(ROOT, 'evidence', 'r3');
const HISTORICAL = new Set(['red-01']);
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const crlfToLf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

// The problems of one manifest: an input whose bytes differ (raw or with CRLF read as LF), a missing or altered transcript.
function problems(manifest, io, { inputs = true } = {}) {
  const out = [];
  if (inputs) {
    for (const input of manifest.inputs || []) {
      let bytes;
      try { bytes = io.readInput(input.path); } catch { out.push(`${input.path}: missing`); continue; }
      if (sha(bytes) !== input.rawSha256 && sha(crlfToLf(bytes)) !== input.crlfToLfSha256) out.push(`${input.path}: differs from the recorded input`);
    }
  }
  for (const t of Object.values(manifest.transcripts || {})) {
    let gz;
    try { gz = io.readTranscript(t.path); } catch { out.push(`${t.path}: missing`); continue; }
    if (sha(gz) !== t.gzipSha256) out.push(`${t.path}: the gzip file differs`);
    else if (sha(zlib.gunzipSync(gz)) !== t.sha256) out.push(`${t.path}: the transcript differs`);
  }
  return out;
}

const files = () => (fs.existsSync(EVIDENCE) ? fs.readdirSync(EVIDENCE, { withFileTypes: true }).filter((d) => d.isDirectory()) : [])
  .flatMap((d) => fs.readdirSync(path.join(EVIDENCE, d.name)).filter((f) => f.endsWith('.json')).map((f) => ({ dir: d.name, file: path.join(EVIDENCE, d.name, f) })));

// An attempt that a later attempt of the same run name replaced (name-1.json, name-2.json) stays as a record: its transcripts are still checked,
// its inputs are the files of that earlier attempt, which later fixes legitimately changed.
function supersededOnes(list) {
  const latest = new Map();
  const parsed = list.map((item) => {
    const m = /^(.*)-(\d+)\.json$/.exec(path.basename(item.file));
    const key = `${item.dir}/${m ? m[1] : path.basename(item.file, '.json')}`;
    const n = m ? Number(m[2]) : 1;
    latest.set(key, Math.max(latest.get(key) || 0, n));
    return { item, key, n };
  });
  return new Set(parsed.filter((p) => p.n < latest.get(p.key)).map((p) => p.item.file));
}

test('every archived manifest recomputes: inputs against the committed files, transcripts against their hashes', () => {
  const list = files();
  const old = supersededOnes(list);
  assert.ok(list.length > 0, 'the final evidence is present');
  for (const { dir, file } of list) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const io = { readInput: (rel) => fs.readFileSync(path.join(REPO, rel)), readTranscript: (rel) => fs.readFileSync(path.join(path.dirname(file), rel)) };
    assert.deepEqual(problems(manifest, io, { inputs: !HISTORICAL.has(dir) && !old.has(file) }), [], `${dir}/${path.basename(file)}`);
  }
});

test('only an attempt that a later attempt of the same run replaced is exempt from the input check', () => {
  const at = (dir, name) => ({ dir, file: path.join(EVIDENCE, dir, name) });
  const list = [at('coverage', 'cov-a-1.json'), at('coverage', 'cov-a-2.json'), at('coverage', 'cov-b-1.json'), at('mutants', 'cov-a-3.json'), at('teardown', 'teardown-fake-az-scenarios.json'), at('green', 'green-all-tests-1.json'), at('green', 'green-all-tests-2.json'), at('green', 'green-all-tests-10.json')];
  assert.deepEqual([...supersededOnes(list)].map((f) => path.basename(f)).sort(), ['cov-a-1.json', 'green-all-tests-1.json', 'green-all-tests-2.json']);
  assert.deepEqual([...supersededOnes([])], []);
});

test('a tampered manifest, input or transcript is detected', () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'util.cjs'));
  const gz = zlib.gzipSync(Buffer.from('transcript'));
  const good = { inputs: [{ path: 'testing/quality/util.cjs', rawSha256: sha(bytes), crlfToLfSha256: sha(crlfToLf(bytes)) }], transcripts: { stdout: { path: 'raw/x.gz', gzipSha256: sha(gz), sha256: sha(Buffer.from('transcript')) } } };
  const io = { readInput: (rel) => fs.readFileSync(path.join(REPO, rel)), readTranscript: () => gz };
  assert.deepEqual(problems(good, io), []);
  const flip = (hex) => `${hex.slice(0, -1)}${hex.endsWith('0') ? '1' : '0'}`;
  assert.equal(problems({ ...good, inputs: [{ ...good.inputs[0], rawSha256: flip(good.inputs[0].rawSha256), crlfToLfSha256: flip(good.inputs[0].crlfToLfSha256) }] }, io).length, 1);
  assert.equal(problems({ ...good, inputs: [{ ...good.inputs[0], path: 'testing/quality/absent.cjs' }] }, io).length, 1);
  assert.equal(problems({ ...good, transcripts: { stdout: { ...good.transcripts.stdout, gzipSha256: flip(good.transcripts.stdout.gzipSha256) } } }, io).length, 1);
  assert.equal(problems({ ...good, transcripts: { stdout: { ...good.transcripts.stdout, sha256: flip(good.transcripts.stdout.sha256) } } }, io).length, 1);
  assert.equal(problems(good, { ...io, readTranscript: () => { throw new Error('missing'); } }).length, 1);
  assert.deepEqual(problems({ ...good, inputs: [{ path: 'absent', rawSha256: 'x', crlfToLfSha256: 'y' }] }, io, { inputs: false }), []);
  assert.deepEqual(problems({}, io), []);
});
