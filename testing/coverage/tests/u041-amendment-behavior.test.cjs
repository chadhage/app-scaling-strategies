'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fs, path, namespace, subject, startNode, makeScratch, dispose } = require('./u041-support.cjs');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.scratch') continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

test('U041 amendment: historical evidence accepts an exact chained replacement without rewriting any original seal', async () => {
  const base = makeScratch('u041-amendment');
  try {
    const copy = path.join(base, 'testing', 'coverage');
    copyTree(subject, copy);
    const evidence = path.join(copy, 'evidence', 'u041');
    fs.mkdirSync(evidence, { recursive: true });
    const surfaceFile = path.join(evidence, 'accepted-surface.json');
    if (!fs.existsSync(surfaceFile)) fs.copyFileSync(path.join(namespace, 'evidence', 'u041', 'accepted-surface.json'), surfaceFile);
    const surface = fs.readFileSync(surfaceFile);
    const addenda = fs.readdirSync(copy).filter((name) => /^evidence-index-addendum-[1-9]\d*\.json$/.test(name))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const previousName = addenda.at(-1);
    const sequence = addenda.length + 1;
    const before = fs.readFileSync(path.join(copy, 'README.md'));
    const snapshot = `evidence\\u041\\original\\fixture-${sequence}-README.md.txt`;
    fs.mkdirSync(path.dirname(path.join(copy, snapshot)), { recursive: true });
    fs.writeFileSync(path.join(copy, snapshot), before, { flag: 'wx' });
    const after = Buffer.concat([before, Buffer.from('\nU041 fixture: this exact extra paragraph is authorized only in this isolated copy.\n')]);
    fs.writeFileSync(path.join(copy, 'README.md'), after);
    const addendum = {
      schema: 'U009-evidence-index-addendum/1', cardId: 'U009', item: 'U041', sequence,
      base: { path: 'evidence\\u041\\accepted-surface.json', crlfToLfSha256: sha(lf(surface)) },
      previous: previousName ? { name: previousName, crlfToLfSha256: sha(lf(fs.readFileSync(path.join(copy, previousName)))) } : null,
      amendments: [{
        path: 'README.md', previousRawSha256: sha(before), previousCrlfToLfSha256: sha(lf(before)),
        rawSha256: sha(after), crlfToLfSha256: sha(lf(after)), previousSnapshot: snapshot
      }],
      additions: []
    };
    fs.writeFileSync(path.join(copy, `evidence-index-addendum-${sequence}.json`), JSON.stringify(addendum, null, 2) + '\n', { flag: 'wx' });
    const process = startNode(['--test', '--test-concurrency=1', path.join(copy, 'tests', 'evidence.test.cjs')], {
      cwd: base, env: { U041_SUBJECT_ROOT: undefined, U009_EVIDENCE_CAPTURE: undefined }
    });
    try {
      const run = await process.done;
      assert.equal(run.status, 0, `the exact authorized replacement must coexist with unchanged historical evidence:\n${run.stdout}\n${run.stderr}`);
      assert.match(run.stdout, /# fail 0/);
      assert.doesNotMatch(run.stdout, /# skipped [1-9]/);
    } finally {
      await process.close();
    }
  } finally {
    dispose(base);
  }
});

module.exports = { copyTree };
