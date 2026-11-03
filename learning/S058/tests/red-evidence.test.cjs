'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const evidence = path.join(folder, 'evidence');
const json = (file) => JSON.parse(fs.readFileSync(path.join(evidence, file), 'utf8'));
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const canonical = (raw) => raw.toString('utf8').replace(/\r\n/g, '\n');

test('raw snapshots retain the full loadable stub and the unchanged assertions/BDD', () => {
  const index = json(path.join('red', 'snapshots.json'));
  assert.equal(index.assertionFailures, 17);
  assert.equal(index.apiLoadPasses, 1);
  for (const item of index.snapshots) {
    const raw = fs.readFileSync(path.join(evidence, 'red', item.snapshot));
    assert.equal(raw.length, item.bytes);
    assert.equal(hash(raw), item.sha256);
    assert.ok(item.snapshot.endsWith('.snapshot'));
    if (item.source === 'model.js') {
      assert.notEqual(canonical(raw), canonical(fs.readFileSync(path.join(folder, item.source))));
    } else {
      assert.equal(canonical(raw), canonical(fs.readFileSync(path.join(folder, item.source))));
    }
  }
});

test('BDD, stub load, real assertion RED, IaC N/A and implementation GREEN retain ordered receipts', () => {
  const labels = ['source', 'bdd', 'stub-load', 'red', 'red-snapshots', 'iac-stage', 'green-model'];
  let previous = 0;
  for (const label of labels) {
    const receipt = json(`${label}.json`);
    assert.equal(receipt.processError, null);
    assert.equal(receipt.exitCode, label === 'red' ? 1 : 0);
    assert.ok(Date.parse(receipt.startedAtUtc) >= previous);
    previous = Date.parse(receipt.finishedAtUtc);
    for (const stream of [receipt.stdout, receipt.stderr]) {
      const raw = fs.readFileSync(path.join(evidence, stream.file));
      assert.equal(raw.length, stream.bytes);
      assert.equal(hash(raw), stream.sha256);
    }
  }
  const red = fs.readFileSync(path.join(evidence, 'red.stdout.txt'), 'utf8');
  assert.equal((red.match(/code: 'ERR_ASSERTION'/g) || []).length, 17);
  assert.doesNotMatch(red, /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|ENOENT/);
  assert.equal(json('iac-na.json').afterGenuineRed, true);
  assert.equal(json('iac-na.json').iac, 'N/A');
});

test('historical RED replays in memory as 17 assertion failures and one API-load pass', () => {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(__dirname, 'replay-red.cjs')], {
    env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /# pass 1\b/);
  assert.match(result.stdout, /# fail 17\b/);
  assert.equal((result.stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, 17);
  assert.doesNotMatch(result.stdout + result.stderr, /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|ENOENT/);
});
