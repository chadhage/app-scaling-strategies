'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const HELPER_SHA256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const BASE_SOURCES = [
  '.gitattributes', 'windows-slot-promotion.feature', 'model.js', 'index.html', 'app.js',
  'styles.css', 'README.txt', 'manifest.json', 'scripts\\csp-probe.js',
  'scripts\\evidence.cjs', 'scripts\\record-red.cjs', 'scripts\\record-green.cjs',
  'tests\\model.test.cjs', 'tests\\browser.test.cjs', 'tests\\integrity.test.cjs',
  'tests\\browser-evidence.test.cjs', 'evidence\\iac-na.json', 'evidence\\source-contract.json',
];
const BROWSER_GROUPS = [
  'load-banner-and-boundary', 'keyboard-positive-prepared', 'wished-is-not-observed',
  'completed-synthetic-journeys', 'reset-retains-evidence-and-allowance',
  'acknowledgement-error-recovery', 'typed-selection-error-recovery',
  'production-target-negative', 'declared-configuration-unknown', 'healthy-200-negative',
  'effective-setting-negative', 'state-compatibility-negative', 'missing-routing-unknown',
  'unfinished-journey-unknown', 'pinned-client-no-migration-proof',
  'former-worker-failure-retained', 'exhausted-allowance-error-reset', 'real-CSP-enforcement',
];
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function rawGitBlob(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}
function listFiles(directory = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile()) files.push(path.relative(ROOT, full));
    else throw new Error(`Unsupported non-regular owned entry: ${entry.name}`);
  }
  return files.sort();
}
function treeHashes() {
  return Object.fromEntries(listFiles().map((relative) =>
    [relative, sha256(fs.readFileSync(path.join(ROOT, relative)))]));
}
function sourceFiles(includeIntegrity = true) {
  const red = listFiles(path.join(ROOT, 'evidence', 'red'));
  const files = [...BASE_SOURCES, ...red];
  if (includeIntegrity && fs.existsSync(path.join(ROOT, 'evidence', 'integrity.json'))) {
    files.push('evidence\\integrity.json');
  }
  return [...new Set(files)].sort();
}
function sourceBytes() {
  return Object.fromEntries(sourceFiles().map((relative) => {
    const bytes = fs.readFileSync(path.join(ROOT, relative));
    return [relative, { rawSha256: sha256(bytes), byteLength: bytes.length, base64: bytes.toString('base64') }];
  }));
}
function sourceHashes() {
  return Object.fromEntries(Object.entries(sourceBytes()).map(([relative, value]) =>
    [relative, value.rawSha256]));
}
function git(args) {
  const result = spawnSync('git', args, { cwd: REPO, encoding: 'utf8', timeout: 15000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || 'Read-only Git inspection failed.');
  return result.stdout.trim();
}
function gitLogicalPath(full) {
  // Git --path uses repository grammar, not a Windows filesystem path.
  return path.relative(REPO, full).split(path.sep).join('/');
}
function writeIntegrity() {
  const sources = {};
  for (const relative of sourceFiles(false)) {
    const full = path.join(ROOT, relative);
    const bytes = fs.readFileSync(full);
    const repoRelative = gitLogicalPath(full);
    const text = bytes.toString('utf8');
    sources[relative] = {
      rawSha256: sha256(bytes), byteLength: bytes.length,
      rawGitBlobSha1: rawGitBlob(bytes),
      canonicalGitBlobSha1: git(['hash-object', `--path=${repoRelative}`, full]),
      crlfPairs: (text.match(/\r\n/g) || []).length,
      attributes: git(['check-attr', 'text', 'eol', 'diff', 'whitespace', '--', repoRelative]),
    };
  }
  const record = {
    cardId: 'A-S121', workerId: 'worker-A-S121', packet: 'SC-S121',
    observedAtUtc: new Date().toISOString(), mode: 'raw-byte and canonical-Git provenance',
    rawAndCanonicalAreSeparate: true, sources,
    helperSha256: sha256(fs.readFileSync(path.join(REPO, 'testing', 'browser', 'isolated.cjs'))),
    iacCreatedAtUtc: fs.statSync(path.join(ROOT, 'evidence', 'iac-na.json')).birthtime.toISOString(),
    prePinning: {
      archive: 'evidence\\raw\\pre-pinning.sources.raw.gz',
      archiveSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'pre-pinning.sources.raw.gz'))),
      integrity: 'evidence\\raw\\integrity-before-raw-pinning.json',
      integritySha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'integrity-before-raw-pinning.json'))),
      failedRun: 'evidence\\raw\\pre-browser.json',
      resolution: 'Explicit owned asset and raw-proof -text attributes preserve original CRLF bytes across Git publication.',
      priorCanonicalPathQualified: false,
    },
    gitPathRepair: {
      archive: 'evidence\\raw\\pre-git-logical-path.sources.raw.gz',
      archiveSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'pre-git-logical-path.sources.raw.gz'))),
      integrity: 'evidence\\raw\\integrity-before-git-logical-path.json',
      integritySha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'integrity-before-git-logical-path.json'))),
      failedRun: 'evidence\\raw\\pre-browser-attempt-1.json',
      resolution: 'Git hash-object --path requires logical repository separators; native filesystem paths remain Windows paths.',
      priorCanonicalPathQualified: false,
    },
    pageOwnedCspRepair: {
      archive: 'evidence\\raw\\before-page-owned-csp.sources.raw.gz',
      archiveSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'before-page-owned-csp.sources.raw.gz'))),
      integrity: 'evidence\\raw\\integrity-before-page-owned-csp.json',
      integritySha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'integrity-before-page-owned-csp.json'))),
      failedRun: 'evidence\\raw\\browser.json',
      automationEvalContextQualified: false,
      resolution: 'Real DOM click invokes page-owned external CSP probe; automation only reads the completed result.',
    },
    rawLogDiffPolicy: {
      archive: 'evidence\\raw\\before-raw-log-diff.sources.raw.gz',
      archiveSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'before-raw-log-diff.sources.raw.gz'))),
      integrity: 'evidence\\raw\\integrity-before-raw-log-diff.json',
      integritySha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'integrity-before-raw-log-diff.json'))),
      noRawProofRewritten: true,
      resolution: 'Only exact raw-log path patterns use -diff; Node assertion-log whitespace is preserved, not trimmed.',
      priorBrowserObservation: 'evidence\\browser\\observations.json',
      priorBrowserObservationSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'browser', 'observations.json'))),
    },
    stagedWhitespaceRepair: {
      archive: 'evidence\\raw\\before-staged-whitespace.sources.raw.gz',
      archiveSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'before-staged-whitespace.sources.raw.gz'))),
      integrity: 'evidence\\raw\\integrity-before-staged-whitespace.json',
      integritySha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'raw', 'integrity-before-staged-whitespace.json'))),
      failedCheck: 'evidence\\raw\\staged-whitespace.json',
      noIndexProbeQualified: false,
      resolution: 'Exact owned paths declare cr-at-eol while retaining blank-at-eol/EOF and space-before-tab checks; raw logs/snapshots are byte-preserved -diff.',
      priorBrowserObservation: 'evidence\\browser\\observations-v2.json',
      priorBrowserObservationSha256: sha256(fs.readFileSync(path.join(ROOT, 'evidence', 'browser', 'observations-v2.json'))),
    },
    nativeEvidence: false, additionalKanoCredits: 0,
  };
  assert.equal(record.helperSha256, HELPER_SHA256);
  fs.writeFileSync(path.join(ROOT, 'evidence', 'integrity.json'),
    `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}
function captureRequested(value) { return value === '1'; }
function captureBrowser(record) {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Only exact deliberate browser capture is permitted.');
  const directory = path.join(ROOT, 'evidence', 'browser');
  fs.mkdirSync(directory, { recursive: true });
  const planned = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).evidence.browser;
  assert.match(planned, /^evidence\/browser\/observations(?:-v\d+)?\.json$/);
  const plannedStem = path.basename(planned, '.json');
  const stem = fs.existsSync(path.join(directory, `${plannedStem}.json`))
    ? `${plannedStem}-${Date.now()}-${crypto.randomUUID()}` : plannedStem;
  const archive = zlib.gzipSync(Buffer.from(JSON.stringify({
    format: 'original source bytes, base64; not Git-cleaned text', files: sourceBytes(),
  })));
  const archiveName = `${stem}.sources.raw.gz`;
  const result = Object.assign({}, record, {
    sourceHashes: sourceHashes(), sourceArchive: archiveName, sourceArchiveSha256: sha256(archive),
  });
  fs.writeFileSync(path.join(directory, archiveName), archive, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, `${stem}.json`), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
  return path.relative(ROOT, path.join(directory, `${stem}.json`));
}
if (require.main === module) {
  assert.equal(process.argv[2], '--capture-integrity', 'Use an explicit producer integrity capture, not verification.');
  const record = writeIntegrity();
  console.log(JSON.stringify({ cardId: record.cardId, sourceCount: Object.keys(record.sources).length,
    helperSha256: record.helperSha256, output: 'evidence\\integrity.json' }));
}
module.exports = {
  ROOT, REPO, HELPER_SHA256, BASE_SOURCES, BROWSER_GROUPS,
  sha256, rawGitBlob, listFiles, treeHashes, sourceFiles, sourceBytes, sourceHashes,
  git, gitLogicalPath, captureRequested, captureBrowser,
};
