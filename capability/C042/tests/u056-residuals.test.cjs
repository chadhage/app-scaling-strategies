'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const cost = require('./u056-cost.cjs');

const root = path.resolve(__dirname, '..');
const before = process.env.U056_REPLAY === 'before';
const read = (name) => fs.readFileSync(before ? path.join(root, 'evidence', 'u056-residuals', 'retained', `${name}.txt`) : path.join(root, name), 'utf8');

test('F1: README and U039 limits explicitly narrow Upgrade-flagged incomplete requests', () => {
  for (const name of ['README.md', 'U039.md']) {
    const text = read(name);
    assert.match(text, /Upgrade-flagged request is outside (?:this|the incomplete-body) rule/);
    assert.match(text, /bad chunk size gets the typed 408 at the request timeout/);
    assert.match(text, /client FIN (?:gets )?a silent close/);
  }
});

test('F2: a plain evidence verification rejects an unpinned file in an indexed U039 directory', () => {
  const filename = path.join(__dirname, 'u039-evidence.test.cjs');
  const text = cost.source('u039-evidence.test.cjs', before);
  const prefix = text.slice(0, text.indexOf("test('the addendum chain"));
  const load = vm.compileFunction(`${prefix}\nreturn verify;`, ['require', '__dirname'], { filename });
  const verify = load(Module.createRequire(filename), __dirname);
  const files = cost.acceptedFixture();
  files.set('capability/C042/evidence/u039-incomplete-bodies/unpinned-u056.txt', Buffer.from('not indexed'));
  const saved = process.env.U039_STRICT_EVIDENCE;
  try {
    delete process.env.U039_STRICT_EVIDENCE;
    assert.equal(verify({ files: [...files.keys()], read: (name) => files.get(name) ?? null }).some((problem) => /unpinned-u056\.txt: an unlisted addition/.test(problem)), true);
  } finally {
    if (saved === undefined) delete process.env.U039_STRICT_EVIDENCE;
    else process.env.U039_STRICT_EVIDENCE = saved;
  }
});

test('F3: the pending-socket sentence attributes the retained bounded-cost observation', () => {
  const text = read('README.md');
  assert.doesNotMatch(text, /Nothing a client does can make memory, queues or sockets grow without limit/);
  for (const phrase of ['about 2 MB', '1310', '128-connection cap', '48 MB', '12 held sockets', '24', 'accepted parent', 'retained reviewer measurement']) assert.equal(text.includes(phrase), true, phrase);
});

test('F4: the tamper tests read one shared verified 362-file snapshot, not one tree per test', () => {
  const measured = cost.measure(before);
  assert.equal(measured.fixtureFiles, 362);
  assert.equal(measured.uniqueFilesRead, 362);
  assert.equal(measured.maximumReadsOfOneFile, 1, JSON.stringify(measured));
});

test('F4: the nested incomplete-body RED selects one deciding failure and five unchanged controls', () => {
  const replay = cost.replaySelection(before);
  assert.equal(replay.selectedTests, 6, JSON.stringify(replay));
  assert.equal(replay.names.filter((name) => name.startsWith('incomplete ')).length, 1);
});
