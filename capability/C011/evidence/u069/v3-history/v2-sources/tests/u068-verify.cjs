'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { root, list, sha } = require('./u068-seal.cjs');
const {historical}=require('./u068-epoch-verifier.cjs');
const repository = path.resolve(root, '..', '..');
const parse = (bytes) => JSON.parse(bytes.toString('utf8'));
const summaryOf = (text) => Object.fromEntries(['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']
  .flatMap((key) => { const match = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text); return match ? [[key, Number(match[1])]] : []; }));
const defaultReaders = {
  read: (file) => fs.readFileSync(path.join(root, ...file.split('/'))),
  dependency: (file) => fs.readFileSync(path.join(repository, ...file.split('/'))),
  files: () => list()
};

function verify(given = {}) {
  const readers = { ...defaultReaders, ...given };
  const problems = [];
  const add = (kind, file) => problems.push({ kind, path: file });
  const readJson = (file) => {
    try { return parse(readers.read(file)); }
    catch { add('JSON_UNREADABLE', file); return null; }
  };
  const pins = readJson('evidence/current/pins.json');
  if (!pins || pins.schema !== 'U068-U069-current-seal/1' || !Array.isArray(pins.files)) return {
    problems: [{ kind: 'FINAL_SEAL_REQUIRED', path: 'evidence/current/pins.json' }], records: new Map(), data: new Map(), readers
  };
  const actual = readers.files().filter((file) => file !== 'evidence/current/pins.json').sort();
  const declared = pins.files.map((entry) => entry.path).sort();
  if (new Set(declared).size !== declared.length || JSON.stringify(actual) !== JSON.stringify(declared)) add('EXACT_ADDITION_SET_DIFFERS', 'evidence/current/pins.json');
  for (const pin of pins.files) {
    try { if (!pin.acceptedSha256.includes(sha(readers.read(pin.path)))) add('FILE_SHA256_DIFFERS', pin.path); }
    catch { add('FILE_UNREADABLE', pin.path); }
  }
  const freeze = readJson('evidence/current/source-freeze.json');
  if (!freeze || freeze.schema !== 'U068-U069-source-freeze/1') add('SOURCE_FREEZE_REQUIRED', 'evidence/current/source-freeze.json');
  else {
    const sourceFiles = actual.filter((file) => !file.startsWith('evidence/')).sort();
    if (JSON.stringify(sourceFiles) !== JSON.stringify(freeze.files.map((entry) => entry.path).sort())) add('FROZEN_SOURCE_SET_DIFFERS', 'evidence/current/source-freeze.json');
    for (const entry of freeze.files) {
      try { if (!entry.acceptedSha256.includes(sha(readers.read(entry.path)))) add('FROZEN_SOURCE_SHA256_DIFFERS', entry.path); }
      catch { add('FROZEN_SOURCE_UNREADABLE', entry.path); }
    }
    for (const entry of freeze.dependencies) {
      try { if (!entry.acceptedSha256.includes(sha(readers.dependency(entry.path)))) add('FROZEN_DEPENDENCY_SHA256_DIFFERS', entry.path); }
      catch { add('FROZEN_DEPENDENCY_UNREADABLE', entry.path); }
    }
    for(const entry of freeze.historical||[]){
      try{if(sha(readers.read(entry.path))!==entry.sha256)add('HISTORICAL_EXACT_BYTE_DIFFERS',entry.path);}
      catch{add('HISTORICAL_BYTE_UNREADABLE',entry.path);}
    }
  }
  try{
    if(sha(readers.read('evidence/final/pins.json'))!=='168fa6ddf23476df4873e61dcb5031f16852a6fee0a9551a2f14c6f5d2d61dec')add('HISTORICAL_SEAL_SHA_DIFFERS','evidence/final/pins.json');
    if(sha(readers.read('evidence/final/source-freeze.json'))!=='2d9de9701398c2d9d309a04f71e8b4086eabda0647a297c0774063d8b1b10587')add('HISTORICAL_FREEZE_SHA_DIFFERS','evidence/final/source-freeze.json');
    for(const problem of historical(readers.read).problems)add('HISTORICAL_'+problem.kind,problem.path);
  }catch{add('HISTORICAL_VIEW_UNREADABLE','evidence/final');}
  const projection = (stream) => {
    const bytes = readers.read(stream.path);
    if (sha(bytes) !== stream.projectionGzipSha256) add('PROJECTION_GZIP_SHA256_DIFFERS', stream.path);
    const raw = gunzipSync(bytes);
    if (sha(raw) !== stream.projectionSha256 || raw.length !== stream.projectionBytes) add('PROJECTION_SHA256_DIFFERS', stream.path);
    if (!/^[0-9a-f]{64}$/.test(stream.privateOriginalSha256) || stream.kind !== 'public projection, NOT original raw') add('PRIVATE_ORIGINAL_BINDING_INVALID', stream.path);
    return raw.toString('utf8');
  };
  const records = new Map();
  const data = new Map();
  for (const file of actual.filter((name) => /^evidence\/current\/(?:records|data)\//.test(name) && name.endsWith('.json'))) {
    const value = readJson(file);
    if (!value) continue;
    if (value.schema === 'U068-U069-public-capture/1') {
      try {
        const out = projection(value.transcripts.stdout);
        projection(value.transcripts.stderr);
        const parsed = summaryOf(out);
        for (const [key, count] of Object.entries(parsed)) if (value.summary[key] !== count) add('CAPTURE_SUMMARY_DIFFERS', file);
        if (value.execution.timedOut || value.execution.signal || value.execution.spawnError || value.execution.exitCode !== value.execution.expectedExitCode) add('CAPTURE_EXECUTION_FAILED', file);
        for (const input of value.inputs) {
          if(input.subject.scope==='private-original-projection'){
            if(input.subject.kind!=='public projection, NOT original input bytes'||input.subject.privateOriginalSha256!==input.rawSha256
              ||sha(readers.read(input.subject.path))!==input.subject.projectionSha256)add('PRIVATE_INPUT_PROJECTION_DIFFERS',input.path);
          }else{
            const bytes = input.subject.scope === 'C011' ? readers.read(input.subject.path) : readers.dependency(input.subject.path);
            if (!input.acceptedSha256.includes(sha(bytes))) add('CAPTURE_INPUT_SHA256_DIFFERS', input.path);
          }
          if (!input.acceptedSha256.includes(input.rawSha256) || !input.acceptedSha256.includes(input.lfSha256)) add('INPUT_DIGEST_PAIR_INVALID', file);
        }
        if (!/^[0-9a-f]{64}$/.test(value.privateOriginalRecordSha256)) add('PRIVATE_RECORD_HASH_INVALID', file);
        if (records.has(value.name)) add('DUPLICATE_CAPTURE_NAME', file);
        records.set(value.name, { ...value, stdout: out });
      } catch { add('CAPTURE_UNREADABLE', file); }
    } else if (value.schemaVersion === 1 && Array.isArray(value.inputs) && value.transcripts) {
      try {
        let out;
        for (const name of ['stdout', 'stderr']) {
          const stream = value.transcripts[name];
          const relative = path.posix.join(path.posix.dirname(file), stream.path.replaceAll('\\', '/'));
          const compressed = readers.read(relative);
          if (sha(compressed) !== stream.gzipSha256) add('INHERITED_GZIP_SHA256_DIFFERS', relative);
          const bytes = gunzipSync(compressed);
          if (sha(bytes) !== stream.sha256 || bytes.length !== stream.bytes) add('INHERITED_STREAM_SHA256_DIFFERS', relative);
          if (name === 'stdout') out = bytes.toString('utf8');
        }
        for (const input of value.inputs) {
          const relative = input.path.replaceAll('\\', '/').replace(/^capability\/C011\//, '');
          const digest = sha(readers.read(relative));
          if (digest !== input.rawSha256 && digest !== input.crlfToLfSha256) add('INHERITED_INPUT_SHA256_DIFFERS', relative);
        }
        for (const [key, count] of Object.entries(summaryOf(out))) if (value.summary[key] !== count) add('INHERITED_SUMMARY_DIFFERS', file);
        if (value.exitCode !== value.expectedExitCode || value.timedOut || value.signal || value.spawnError) add('INHERITED_EXECUTION_DIFFERS', file);
      } catch { add('INHERITED_CAPTURE_UNREADABLE', file); }
    } else if (value.schema === 'U068-U069-public-data/1') {
      if (!/^[0-9a-f]{64}$/.test(value.privateOriginalSha256) || value.kind !== 'public projection, NOT original raw') add('PUBLIC_DATA_AUTHORITY_INVALID', file);
      data.set(value.name, value.data);
    }
  }
  const catalog = readJson('evidence/current/catalog.json');
  if (!catalog || catalog.records?.length !== records.size || catalog.data?.length !== data.size) add('CATALOG_DIFFERS', 'evidence/current/catalog.json');
  if (catalog) {
    for (const entry of catalog.records || []) if (!records.has(entry.name)) add('CATALOG_CAPTURE_MISSING', entry.path);
    for (const entry of catalog.data || []) if (!data.has(entry.name)) add('CATALOG_DATA_MISSING', entry.path);
  }
  return { problems, records, data, projection, readers, freeze, catalog, pins };
}
module.exports = { verify, summaryOf, defaultReaders, sha, parse };
