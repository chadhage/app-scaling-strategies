'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const folder = path.join(__dirname, '..', 'evidence', 'red');
fs.mkdirSync(folder, { recursive: true });
const sources = [
  ['model.js', 'model.source.snapshot'],
  [path.join('tests', 'model.test.cjs'), 'assertions.source.snapshot'],
  ['api-migration.feature', 'feature.source.snapshot'],
  [path.join('tests', 'stub-load.cjs'), 'stub-load.source.snapshot'],
];
const snapshots = sources.map(([source, name]) => {
  const raw = fs.readFileSync(path.join(__dirname, '..', source));
  fs.writeFileSync(path.join(folder, name), raw, { flag: 'wx' });
  return {
    source, snapshot: name, bytes: raw.length,
    sha256: createHash('sha256').update(raw).digest('hex'),
    rawCRLFPairs: (raw.toString('utf8').match(/\r\n/g) || []).length,
  };
});
const record = {
  capturedAtUtc: new Date().toISOString(), cardId: 'A-S053',
  stage: 'BDD and loadable full-API stub, before genuine assertion RED',
  snapshots, discovery: 'Binary .snapshot extensions are not auto-discovered by node:test.',
};
fs.writeFileSync(path.join(folder, 'snapshots.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(record, null, 2));
