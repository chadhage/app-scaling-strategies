'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const BASE = 'evidence\\u007\\final\\authority-base.json';
const HEAD = 'evidence\\u007\\final\\authority-head-2.json';
const BASE_SHA256 = '776d6dda43109def3e2576ac3ad06e4adae0f88c2ec64e59469354abc8e5cb6e';
const PREVIOUS = 'evidence\\u007\\amendments\\authority-head-1.json';
const REQUIRED = ['README-U007-final.md', 'U007-final.feature', 'tests\\u007-final-native.cjs',
  'tests\\u007-final-authority.cjs', 'tests\\u007-final-authority.test.cjs'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const closed = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...fields].sort().join('\0');
const digestSet = (value) => closed(value, ['rawSha256', 'lfSha256', 'crlfSha256'])
  && Object.values(value).every((item) => typeof item === 'string' && /^[0-9a-f]{64}$/.test(item));
const safe = (file) => typeof file === 'string' && file.length < 512 && !file.includes('/')
  && !path.isAbsolute(file) && file.split('\\').every((part) => part && part !== '.' && part !== '..' && !/[:\0]/.test(part));
const fail = (code, file) => { throw Object.assign(new Error(code + ':' + file), { code }); };
const enumerate = (directory, prefix = '') => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(prefix, entry.name);
  return entry.isDirectory() ? enumerate(path.join(directory, entry.name), file) : [file];
});
function verify(root, read = (file) => fs.readFileSync(path.join(root, file)), readExternal = (file) => fs.readFileSync(path.join(root, '..', '..', '..', file))) {
  try {
    const bytesOf = (file) => {
      if (!safe(file)) fail('U007_FINAL_PATH', file);
      let bytes;
      try { bytes = read(file); } catch { fail('U007_FINAL_MISSING', file); }
      if (!Buffer.isBuffer(bytes)) fail('U007_FINAL_BYTES', file);
      return bytes;
    };
    const parse = (file) => {
      try { return JSON.parse(bytesOf(file).toString('utf8')); } catch (error) {
        if (error.code?.startsWith('U007_FINAL_')) throw error;
        fail('U007_FINAL_JSON', file);
      }
    };
    if (hash(bytesOf(BASE)) !== BASE_SHA256) fail('U007_FINAL_BASE_CHANGED', BASE);
    const base = parse(BASE);
    if (!closed(base, ['schema', 'cardId', 'acceptedBaseline', 'retainedU007', 'previous', 'files', 'external'])
      || base.schema !== 'U007-final-base/1' || base.cardId !== 'U007'
      || base.acceptedBaseline.files !== 514 || base.retainedU007.files !== 185
      || base.files.length !== 699 || base.previous.path !== PREVIOUS
      || hash(bytesOf(PREVIOUS)) !== base.previous.rawSha256) fail('U007_FINAL_BASE_SHAPE', BASE);
    const expected = new Set([HEAD]);
    const check = (entry, reader = bytesOf) => {
      if (!closed(entry, ['path', 'digests']) || !safe(entry.path) || !digestSet(entry.digests)) fail('U007_FINAL_PIN_SHAPE', entry.path);
      const bytes = reader(entry.path);
      if (!Object.values(entry.digests).includes(hash(bytes))) fail('U007_FINAL_PIN_CHANGED', entry.path);
    };
    for (const entry of base.files) {
      if (expected.has(entry.path)) fail('U007_FINAL_DUPLICATE', entry.path);
      check(entry);
      expected.add(entry.path);
    }
    for (const entry of base.external) check(entry, readExternal);
    const head = parse(HEAD);
    if (!closed(head, ['schema', 'cardId', 'sequence', 'base', 'previous', 'files', 'captures', 'nativeSummary', 'reusedProof'])
      || head.schema !== 'U007-final-head/1' || head.cardId !== 'U007' || head.sequence !== 2
      || head.base.path !== BASE || head.base.rawSha256 !== BASE_SHA256
      || head.previous.path !== PREVIOUS || head.previous.rawSha256 !== base.previous.rawSha256
      || !Array.isArray(head.files) || !Array.isArray(head.captures)) fail('U007_FINAL_HEAD', HEAD);
    for (const entry of head.files) {
      if (expected.has(entry.path) || (!REQUIRED.includes(entry.path) && !entry.path.startsWith('evidence\\u007\\final\\'))) fail('U007_FINAL_ADDED_PATH', entry.path);
      check(entry);
      expected.add(entry.path);
    }
    for (const file of [...REQUIRED, BASE, 'evidence\\u007\\final\\.gitattributes']) if (!expected.has(file)) fail('U007_FINAL_REQUIRED', file);
    const actual = enumerate(root);
    const unlisted = actual.filter((file) => !expected.has(file));
    const missing = [...expected].filter((file) => !actual.includes(file));
    if (unlisted.length || missing.length) fail('U007_FINAL_NAMESPACE', JSON.stringify({ unlisted, missing }));
    const historical = require('./u007-current-evidence.cjs').verify(root, read);
    if (historical.length) fail('U007_FINAL_HISTORY', historical.join(';'));
    const names = new Set();
    for (const capture of head.captures) {
      if (!closed(capture, ['name', 'kind', 'manifest', 'manifestSha256', 'productionFile']) || names.has(capture.name)
        || !expected.has(capture.manifest) || hash(bytesOf(capture.manifest)) !== capture.manifestSha256) fail('U007_FINAL_CAPTURE', capture.name);
      names.add(capture.name);
      const manifest = parse(capture.manifest);
      if (manifest.schema !== 'U007-final-derived-capture/1' || manifest.name !== capture.name || manifest.timedOut
        || !manifest.origin.originalManifestSha256 || !Array.isArray(manifest.inputs)) fail('U007_FINAL_MANIFEST', capture.name);
      let stdout;
      for (const [stream, record] of Object.entries(manifest.transcripts)) {
        const compressed = bytesOf(record.path);
        const bytes = zlib.gunzipSync(compressed);
        if (hash(compressed) !== record.gzipSha256 || hash(bytes) !== record.sha256 || bytes.length !== record.bytes) fail('U007_FINAL_STREAM', capture.name + ':' + stream);
        if (stream === 'stdout') stdout = bytes.toString('utf8').replace(/\r\n/g, '\n');
      }
      for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
        const found = stdout.match(new RegExp('^# ' + key + ' (\\d+)$', 'm'));
        if (found && manifest.summary[key] !== Number(found[1])) fail('U007_FINAL_SUMMARY', capture.name + ':' + key);
      }
      if (capture.kind === 'coverage') {
        if (!['scratch.cjs', 'scratch-session.cjs'].includes(capture.productionFile) || manifest.exitCode !== 0
          || manifest.summary.coverageRows.length !== 1 || manifest.summary.thresholdErrors.length) fail('U007_FINAL_COVERAGE', capture.name);
        const row = manifest.summary.coverageRows[0];
        const input = manifest.inputs.find((entry) => entry.path === capture.productionFile);
        if (row.file !== capture.productionFile || !input || input.rawSha256 !== base.files.find((entry) => entry.path === capture.productionFile).digests.rawSha256
          || ['lines', 'branches', 'functions'].some((metric) => row[metric] < 85)
          || !manifest.coverageInclude?.absolute || !manifest.coverageInclude.literalDotGitSegment
          || manifest.coverageInclude.hasGlob || manifest.coverageInclude.target !== capture.productionFile) fail('U007_FINAL_COVERAGE', capture.name);
      } else if (capture.kind === 'behavioral-red') {
        if (manifest.exitCode !== 1 || manifest.summary.tests !== 9 || manifest.summary.fail !== 6) fail('U007_FINAL_ORIGINAL_RED', capture.name);
      } else if (capture.kind !== 'operator-failure') {
        if (manifest.exitCode !== 0 || (manifest.summary.fail || 0) !== 0 || (manifest.summary.skipped || 0) !== 0) fail('U007_FINAL_VERIFICATION', capture.name);
      }
    }
    for (const file of ['scratch.cjs', 'scratch-session.cjs']) {
      if (head.captures.filter((capture) => capture.kind === 'coverage' && capture.productionFile === file).length !== 1) fail('U007_FINAL_UNLOADED', file);
    }
    const native = parse(head.nativeSummary);
    if (native.schema !== 'U007-final-native-summary/1' || native.cases.length !== 2 || native.edge.status !== 'Valid'
      || native.edge.version !== '157.0.4341.42' || native.closedNativeChildren !== 54 || native.observationErrors.length) fail('U007_FINAL_NATIVE', head.nativeSummary);
    for (const [index, mode] of ['FIFO', 'LIFO'].entries()) {
      const observation = native.cases[index];
      if (observation.mode !== mode || observation.sessions.length !== 2 || !observation.neighbor.survivedBothOwnedCleanups
        || !observation.neighbor.close.clean || !observation.repeatedScopes || !observation.profiles.every((entry) => entry.absent)
        || observation.sessions.some((session) => !session.clean || !session.confirmed || !session.scratchClean
          || !session.createdProfile || !/^\d+$/.test(session.identity.createdAt))) fail('U007_FINAL_NATIVE', mode);
    }
    const proof = parse(head.reusedProof);
    if (proof.mutation.generated !== 2213 || proof.mutation.executed !== 2213 || proof.mutation.killedByTest !== 2148
      || proof.mutation.killedByBound !== 5 || proof.mutation.equivalenceDemonstrated !== 60
      || proof.mutation.survived || proof.mutation.undecided || proof.mutation.uncaptured || proof.mutation.timeoutsCountedAsKills
      || proof.executedAgain !== false || proof.currentCampaignInputsMatched !== 117) fail('U007_FINAL_REUSED_PROOF', head.reusedProof);
    return [];
  } catch (error) {
    if (error.code?.startsWith('U007_FINAL_')) return [error.message];
    return ['U007_FINAL_INVALID:' + error.message];
  }
}
module.exports = { verify, BASE, HEAD, BASE_SHA256 };
