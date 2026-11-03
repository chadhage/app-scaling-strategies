'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '..', '..', '..');
const git = (args) => execFileSync('git', args, { cwd: repo });
const files = git(['ls-files', '--', 'learning\\S109']).toString('utf8').trim().split(/\r?\n/).filter(Boolean);
assert.ok(files.length > 0, 'Run after scoped publication: canonical Git blobs must exist.');
let rawFiles = 0;
for (const file of files) {
  const working = fs.readFileSync(path.join(repo, ...file.split('/')));
  const canonical = git(['show', `HEAD:${file}`]);
  if (file.includes('/evidence/raw/')) {
    assert.deepEqual(working, canonical, `Raw bytes must stay exact: ${file}`);
    rawFiles++;
  } else {
    const lf = Buffer.from(working.toString('utf8').replace(/\r\n/g, '\n'));
    assert.deepEqual(lf, canonical, `Separate LF projection must match canonical Git: ${file}`);
    if (/\.(?:js|cjs)$/.test(file)) new vm.Script(canonical.toString('utf8'), { filename: file });
    if (file.endsWith('.json')) JSON.parse(canonical.toString('utf8'));
  }
}
const context = vm.createContext({ module: { exports: {} } });
vm.runInContext(git(['show', 'HEAD:learning/S109/model.js']).toString('utf8'), context, { timeout: 1000 });
const verdicts = JSON.parse(vm.runInContext(`JSON.stringify(
  ['baseline', 'raised', 'ceiling', 'missing'].flatMap(level =>
    ['direct', 'pooled'].map(strategy => {
      const m = module.exports;
      const state = m.transition(m.transition(m.initial(), {type:'rehearse',level,strategy}), {type:'inspect'});
      const view = m.summarize(state);
      return [level, strategy, view.current.result, view.nativeSnat.status];
    })
  )
)`, context, { timeout: 1000 }));
assert.deepEqual(verdicts, [
  ['baseline', 'direct', 'positive', 'unverified'], ['baseline', 'pooled', 'positive', 'unverified'],
  ['raised', 'direct', 'negative', 'unverified'], ['raised', 'pooled', 'positive', 'unverified'],
  ['ceiling', 'direct', 'negative', 'unverified'], ['ceiling', 'pooled', 'negative', 'unverified'],
  ['missing', 'direct', 'unknown', 'unverified'], ['missing', 'pooled', 'unknown', 'unverified'],
]);
console.log(`Canonical Git PASS: ${files.length} owned blobs, ${rawFiles} exact raw archives; eight LF-model verdicts. Read-only.`);
