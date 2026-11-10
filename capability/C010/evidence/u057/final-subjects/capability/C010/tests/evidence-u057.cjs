'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const io = require('./evidence-io.cjs');
const { walk } = require('./evidence-verify.cjs');

const ADDENDUM = 'evidence/u057/amendment-1.json';
const HEAD = 'evidence/u057/head.sha256';
const ORIGINAL = 'evidence/u057/original-subjects.json';
const CAMPAIGN = 'evidence/u057/campaign-04/mutation-03.report.json';
let phaseName = 'final';
try {
  const declared = JSON.parse(io.readFileSync(path.join(__dirname, '..', ADDENDUM), 'utf8')).finalPhase?.name;
  if (/^final(?:-[0-9]+)?$/.test(declared)) phaseName = declared;
} catch { /* an unsealed draft is not qualified by verify() */ }
const FINAL = `evidence/u057/${phaseName}/`;
const PHASE_INPUTS = phaseName === 'final' ? 'evidence/u057/final-phase-inputs.json' : `evidence/u057/${phaseName}-inputs.json`;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const read = (root, name) => io.readFileSync(path.join(root, name));
const json = (root, name) => JSON.parse(read(root, name).toString('utf8'));
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');
const names = (root) => walk(root).map((file) => rel(root, file)).sort();
const pin = (root, name) => {
  const bytes = read(root, name);
  return { path: name, bytes: bytes.length, rawSha256: sha(bytes), lfSha256: sha(lf(bytes)) };
};
const matches = (bytes, entry, exact = false) => sha(bytes) === entry.rawSha256 || (!exact && sha(lf(bytes)) === entry.lfSha256);

function originalChecks(root, problems) {
  const original = json(root, ORIGINAL);
  if (original.originalPublication.commit !== 'e22b94da118bfe7f62fc8849b783adf14c36ae9d') problems.push('original: retained C010 publication differs');
  if (sha(read(root, 'evidence/seal.json')) !== original.baseSealRawSha256) problems.push('original: evidence/seal.json changed');
  for (const entry of original.files) {
    const target = entry.archive || entry.path;
    if (!io.existsSync(path.join(root, target))) problems.push(`original: ${target} is missing`);
    else if (!matches(read(root, target), entry, true)) problems.push(`original: ${target} is not the retained raw bytes`);
  }
  const legacyRoot = path.join(root, 'evidence', 'u057', 'original', 'capability', 'C010');
  const legacyIo = require(path.join(legacyRoot, 'tests', 'evidence-io.cjs'));
  const legacyVerify = require(path.join(legacyRoot, 'tests', 'evidence-verify.cjs'));
  const legacyFigures = require(path.join(legacyRoot, 'tests', 'evidence-figures.cjs'));
  const virtual = new Map(original.files.filter((entry) => entry.path.startsWith('evidence/')).map((entry) => [
    path.join(legacyRoot, entry.path), read(root, entry.archive || entry.path)
  ]));
  const found = legacyIo.withEdits(virtual, () => legacyVerify.verify(legacyRoot, { checks: [legacyFigures.checksOf] }));
  for (const problem of found) problems.push(`original: ${problem}`);
}

function inventoryChecks(root, problems) {
  const document = json(root, ADDENDUM);
  const anchor = read(root, HEAD).toString('ascii');
  if (!/^[0-9a-f]{64}\n$/.test(anchor) || sha(read(root, ADDENDUM)) !== anchor.trim()) problems.push('amendment: head does not anchor the exact addendum bytes');
  if (document.schema !== 'C010-U057-amendment/1' || document.kanoCredit !== 0 || document.owner !== 'worker-U057') problems.push('amendment: identity or zero-credit scope differs');
  if (document.finalPhase?.name !== phaseName || document.finalPhase?.prefix !== FINAL || document.finalPhase?.inputs !== PHASE_INPUTS) problems.push('amendment: final phase selector is missing or outside its exact scope');
  if (sha(read(root, ORIGINAL)) !== document.originalSubjectsRawSha256) problems.push('amendment: original subject index differs');
  const original = json(root, ORIGINAL);
  const old = new Map(original.files.map((entry) => [entry.path, entry]));
  const expected = new Map(original.files.map((entry) => [entry.path, entry]));
  for (const entry of document.supersedes) {
    const before = old.get(entry.path);
    if (!before || entry.previousRawSha256 !== before.rawSha256 || entry.previousArchive !== before.archive) problems.push(`amendment: ${entry.path} does not name its exact predecessor`);
    if (entry.path.startsWith('evidence/') && entry.path !== 'evidence/uncaptured.json') problems.push(`amendment: historical evidence may not be superseded: ${entry.path}`);
    if (entry.path === 'imports.json') problems.push('amendment: imported C009 authority may not be repinned');
    expected.set(entry.path, entry);
  }
  for (const entry of document.adds) {
    if (expected.has(entry.path)) problems.push(`amendment: duplicate or falsely added path ${entry.path}`);
    expected.set(entry.path, entry);
  }
  for (const [name, entry] of expected) {
    if (!io.existsSync(path.join(root, name))) problems.push(`amendment: ${name} is missing`);
    else if (!matches(read(root, name), entry, name.startsWith('evidence/'))) problems.push(`amendment: ${name} differs from its pin`);
  }
  const allowed = new Set([...expected.keys(), ADDENDUM, HEAD]);
  for (const name of names(root)) if (!allowed.has(name)) problems.push(`amendment: ${name} is not sealed`);
  const uncaptured = json(root, 'evidence/uncaptured.json');
  const prior = json(root, old.get('evidence/uncaptured.json').archive);
  const remaining = { ...prior.items };
  delete remaining.mutation;
  if (JSON.stringify(uncaptured.items) !== JSON.stringify(remaining)) problems.push('amendment: only the completed mutation gap may be removed');
  if (io.existsSync(path.join(root, PHASE_INPUTS))) {
    for (const entry of json(root, PHASE_INPUTS).inputs) {
      if (!entry.archive || !io.existsSync(path.join(root, entry.archive)) || !matches(read(root, entry.archive), entry, true)) problems.push(`amendment: final raw subject ${entry.path} was not preserved`);
      if (!io.existsSync(path.join(root, entry.path)) || sha(lf(read(root, entry.path))) !== entry.lfSha256) problems.push(`amendment: ${entry.path} changed after the final phase began`);
    }
  }
}

function streams(root, manifestName, document, problems) {
  const output = {};
  for (const stream of ['stdout', 'stderr']) {
    try {
      const entry = document.transcripts[stream];
      const file = path.join(path.dirname(manifestName), entry.path);
      const compressed = read(root, file);
      if (compressed.length !== entry.gzipBytes || sha(compressed) !== entry.gzipSha256) problems.push(`${manifestName}: ${stream} gzip pin differs`);
      const bytes = zlib.gunzipSync(compressed);
      if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) problems.push(`${manifestName}: ${stream} raw stream pin differs`);
      output[stream] = bytes.toString('utf8');
    } catch (error) {
      problems.push(`${manifestName}: ${stream} is missing or not valid gzip`);
      output[stream] = '';
    }
  }
  return output;
}

function variantPaths(root, name, document) {
  return [name, ...(document.inputVariants[name] || [])].filter((candidate) => io.existsSync(path.join(root, candidate)));
}

function captureChecks(root, problems) {
  const amendment = json(root, ADDENDUM);
  for (const name of names(root).filter((file) => file.startsWith('evidence/u057/') && file.endsWith('.json'))) {
    let document;
    try { document = json(root, name); } catch { problems.push(`${name}: invalid JSON`); continue; }
    if (!document.transcripts) continue;
    const output = streams(root, name, document, problems);
    if (document.schemaVersion !== 1) continue;
    const retained = amendment.retainedUnqualifiedCaptures.some((entry) => entry.path === name && entry.reason.length > 40);
    if (!retained && (document.timedOut || document.spawnError || document.exitCode !== document.expectedExitCode)) problems.push(`${name}: run did not finish its declared exit`);
    for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const found = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(output.stdout.replaceAll('\r\n', '\n'));
      if ((found ? Number(found[1]) : undefined) !== document.summary[key]) problems.push(`${name}: ${key} differs from raw TAP`);
    }
    for (const input of document.inputs) {
      const relative = input.path.replaceAll('\\', '/');
      if (!relative.startsWith('capability/C010/')) { problems.push(`${name}: non-C010 mutable capture input ${input.path}`); continue; }
      const subject = relative.slice('capability/C010/'.length);
      const captureSubject = amendment.captureSubjects[name];
      const candidates = captureSubject ? [`${captureSubject}/${subject}`] : name.startsWith(FINAL) ? [subject] : variantPaths(root, subject, amendment);
      if (!candidates.some((candidate) => matches(read(root, candidate), { rawSha256: input.rawSha256, lfSha256: input.crlfToLfSha256 }, candidate.startsWith('evidence/')))) problems.push(`${name}: input ${subject} has no retained matching subject`);
    }
  }
}

function ownList(root, positions = false) {
  const env = { ...process.env };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C010_SUBJECT_DIR', 'C010_U057_GENERATOR_SUBJECT']) delete env[key];
  const run = spawnSync(process.execPath, [path.join(root, 'tests', 'mutate-gen.cjs'), '--list', ...(positions ? ['--positions'] : [])], { env, cwd: path.resolve(root, '..', '..'), encoding: 'utf8', windowsHide: true, maxBuffer: 8 << 20 });
  if (run.status !== 0) throw new Error('generator own --list failed');
  return JSON.parse(run.stdout);
}

function mutationChecks(root, problems, enumeration = ownList(root, true)) {
  const report = json(root, CAMPAIGN);
  if (report.generated !== enumeration.total) problems.push('mutation: report.generated differs from generator own --list total');
  if (report.executed !== enumeration.total || report.notExecuted !== 0 || report.survived !== 0 || report.undecided !== 0) problems.push('mutation: the entire actual generator set is not decided');
  const key = (entry) => `${entry.file}: ${entry.label}`;
  const wanted = new Set(enumeration.positions.map(key));
  const actual = new Map(report.results.map((entry) => [key(entry), entry]));
  if (actual.size !== wanted.size || report.results.length !== actual.size || [...wanted].some((name) => !actual.has(name))) problems.push('mutation: report position set differs from generator own enumeration');
  const decidedKills = report.results.filter((entry) => entry.killed).length;
  const decidedEquivalents = report.results.filter((entry) => !entry.killed && entry.equivalent && !entry.undecided).length;
  if (report.killed !== decidedKills || report.survivedEquivalent !== decidedEquivalents || decidedKills + decidedEquivalents !== enumeration.total) problems.push('mutation: reported counts do not equal the actual position decisions');
  for (const [file, count] of Object.entries(enumeration.perFile)) {
    const recorded = report.perFile[file];
    if (!recorded || recorded.generated !== count || recorded.executed !== count || recorded.killed !== report.results.filter((entry) => entry.file === file && entry.killed).length) problems.push(`mutation: ${file} per-file counts differ from the actual generator/decisions`);
  }
  const raw = read(root, `${CAMPAIGN}.jsonl`).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const latest = new Map(raw.map((entry) => [key(entry), entry]));
  for (const [name, entry] of actual) if (!latest.has(name) || JSON.stringify(entry) !== JSON.stringify(latest.get(name))) problems.push(`mutation: ${name} differs from its last actual incremental decision`);
  const equivalents = require('./mutants-equivalent.cjs');
  const green = new Set(report.baseline.filter((entry) => entry.exitCode === 0).map((entry) => entry.stage));
  if (report.baseline.some((entry) => entry.exitCode !== 0) || green.size === 0) problems.push('mutation: an actual unmutated control failed');
  for (const [name, entry] of actual) {
    if (entry.undecided) problems.push(`mutation: ${name} is undecided`);
    if (entry.killed) {
      if (!entry.failingTests.length || !green.has(entry.stage) || !entry.capture) { problems.push(`mutation: ${name} has no named kill with a green control and raw capture`); continue; }
      const file = path.posix.join(path.posix.dirname(CAMPAIGN), entry.capture);
      const captured = json(root, file);
      const output = streams(root, file, captured, problems);
      if (captured.code === 0 || captured.timedOut || !entry.failingTests.every((label) => captured.failingTests.includes(label)) || /MODULE_NOT_FOUND|SyntaxError/.test(output.stdout)) problems.push(`mutation: ${name} is not an actual named behavioral failure`);
    } else if (entry.equivalent !== equivalents[name]) problems.push(`mutation: ${name} has no unchanged equivalence proof`);
  }
  const survivors = report.results.filter((entry) => !entry.killed);
  if (survivors.length !== 17 || Object.keys(equivalents).length !== 17 || survivors.some((entry) => entry.equivalent !== equivalents[key(entry)])) problems.push('mutation: the original 17 equivalence proofs are not preserved');
  const originalProofs = read(root, 'evidence/u057/original/capability/C010/tests/mutants-equivalent.cjs');
  if (!lf(originalProofs).equals(lf(read(root, 'tests/mutants-equivalent.cjs')))) problems.push('mutation: original equivalence proof bytes differ');
  const extension = json(root, 'evidence/u057/campaign-04/position-extension.json');
  if (extension.originalPositions.length !== 806 || extension.addedPositions.length !== 4 || extension.originalPositions.some((entry) => !actual.has(key(entry))) || extension.addedPositions.some((entry) => !actual.has(key(entry)))) problems.push('mutation: original806 plus the explicit four-position extension are not all accounted for');
  const phase = json(root, PHASE_INPUTS);
  const sourceMatches = (file, hash) => {
    if (!io.existsSync(path.join(root, file))) return false;
    const current = read(root, file);
    const declared = phase.inputs.find((entry) => entry.path === file);
    return [sha(current), sha(lf(current))].includes(hash) || (declared?.rawSha256 === hash && declared.lfSha256 === sha(lf(current)));
  };
  for (const [file, hash] of Object.entries(report.campaign.files)) if (!sourceMatches(file, hash)) problems.push(`mutation: ${file} changed after the campaign began`);
  if (!sourceMatches('tests/mutate-gen.cjs', report.campaign.generator)) problems.push('mutation: generator changed after the campaign began');
  for (const retest of report.retests) for (const [file, hash] of Object.entries(retest.files)) if (!sourceMatches(file, hash)) problems.push(`mutation: ${file} changed after its actual retest`);
  const required = json(root, 'evidence/u057/red/original-positions.json').requiredOriginals;
  for (const position of required) {
    const result = actual.get(key(position));
    if (!result?.killed || !result.capture) { problems.push(`mutation: original reviewer survivor is still open: ${key(position)}`); continue; }
    const captured = json(root, path.posix.join(path.posix.dirname(CAMPAIGN), result.capture));
    if (!captured.assertionFailures?.some((name) => name.startsWith('U057 '))) problems.push(`mutation: required original has no named U057 assertion kill: ${key(position)}`);
  }
}

function semanticChecks(root, problems) {
  const acceptedRed = Array.from({ length: 10 }, (_, index) => `red-original-${String(index + 1).padStart(2, '0')}-02`);
  for (const name of [...acceptedRed, 'red-cancel-after-token-03', 'red-default-limits-02', 'default-idle-only-01', 'equivalence-before-mutant']) {
    const file = `evidence/u057/red/${name}.json`;
    const document = json(root, file);
    const output = streams(root, file, document, problems);
    if (document.exitCode !== 1 || document.timedOut || document.summary.fail < 1 || document.summary.cancelled || document.summary.skipped || !/ERR_ASSERTION/.test(output.stdout) || /MODULE_NOT_FOUND|SyntaxError|testTimeoutFailure/.test(output.stdout)) problems.push(`${name}: not a genuine raw behavioral assertion RED`);
    if (acceptedRed.includes(name) && (document.summary.fail !== 1 || !document.summary.notOk?.[0]?.startsWith('U057 '))) problems.push(`${name}: original mutation did not fail its named U057 assertion alone`);
    if (name === 'red-cancel-after-token-03' && (document.summary.fail !== 1 || !document.summary.notOk[0].includes('both a cut connection and an expired token'))) problems.push(`${name}: the combined barrier assertion is not the sole failure`);
  }
  for (const name of ['green-suite', 'green-default-limits', 'green-commit', 'generator-list', 'generator-retest', 'generator-finalize', 'coverage', 'c009-default-header', 'fresh-lf', 'fresh-crlf', 'equivalence-current-control', 'equivalence-current-mutant']) {
    const file = `${FINAL}${name}.json`;
    const document = json(root, file);
    if (document.exitCode !== 0 || document.timedOut || document.summary.fail || document.summary.cancelled || document.summary.skipped) problems.push(`${file}: final gate did not pass cleanly`);
    const phase = json(root, PHASE_INPUTS);
    if (document.startedAtUtc < phase.lastInputEditAtUtc) problems.push(`${file}: capture predates the last source/test/generator/documentation edit`);
  }
  const suite = json(root, `${FINAL}green-suite.json`);
  const wanted = io.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs') && name !== 'evidence.test.cjs').sort();
  const actual = suite.command.filter((arg) => arg.endsWith('.test.cjs')).map((arg) => path.basename(arg)).sort();
  if (JSON.stringify(wanted) !== JSON.stringify(actual) || suite.summary.tests < 1) problems.push('suite: every non-evidence test file must run without omissions');
  const guard = json(root, `${FINAL}cancelled-guard-rekill.json`);
  const guardOutput = streams(root, `${FINAL}cancelled-guard-rekill.json`, guard, problems).stdout;
  if (guard.exitCode !== 1 || guard.timedOut || guard.summary.fail !== 1 || guard.summary.cancelled || guard.summary.skipped || !guard.summary.notOk?.[0]?.includes('both a cut connection and an expired token') || !/ERR_ASSERTION/.test(guardOutput)) problems.push('commit: the final-source cancellation-after-token mutant was not killed by the combined barrier assertion');
  const enumeration = ownList(root, true);
  const proofPosition = enumeration.positions.find((entry) => entry.file === 'server.cjs' && entry.label === 'condition false @177:15');
  const realText = read(root, 'server.cjs').toString('utf8');
  const mutatedText = realText.slice(0, proofPosition.start) + proofPosition.replacement + realText.slice(proofPosition.end);
  for (const variant of ['control', 'mutant']) {
    const fixture = `evidence/u057/red/stubs/equivalence-current-${variant}/capability/C010/server.cjs`;
    const expected = variant === 'control' ? realText : mutatedText;
    if (!lf(read(root, fixture)).equals(lf(Buffer.from(expected)))) problems.push(`equivalence: current ${variant} is not the exact original generated AuthError proof subject`);
  }
  const defaultsFile = `${FINAL}green-default-limits.json`;
  const defaults = json(root, defaultsFile);
  const stdout = streams(root, defaultsFile, defaults, problems).stdout;
  const observed = stdout.split(/\r?\n/).filter((line) => line.startsWith('# {')).map((line) => JSON.parse(line.slice(2)));
  for (const shape of ['header', 'body']) {
    const entry = observed.find((item) => item.kind === 'default-stall' && item.shape === shape);
    if (!entry || entry.limits.idleMs <= entry.limits.headerMs + entry.limits.checkMs || JSON.stringify(entry.answers) !== JSON.stringify([{ status: 408, code: 'REQUEST_TIMEOUT' }]) || !entry.closed || entry.audit.length !== 1 || entry.audit[0].method !== 'OTHER' || entry.audit[0].code !== 'REQUEST_TIMEOUT') problems.push(`defaults: ${shape} lacks the actual default typed408 and proper single audit record`);
  }
  const coverageFile = `${FINAL}coverage.json`;
  const coverage = json(root, coverageFile);
  const text = streams(root, coverageFile, coverage, problems).stdout;
  const gate = JSON.parse(text.slice(text.indexOf('{\n'), text.lastIndexOf('\n}') + 2));
  const production = ['audit.cjs', 'codes.cjs', 'contract.js', 'page.js', 'server.cjs', 'store.cjs'];
  const actualProduction = io.readdirSync(root).filter((name) => /\.(?:cjs|js|mjs)$/.test(name)).sort();
  if (JSON.stringify(actualProduction) !== JSON.stringify(production)) problems.push('coverage: a first-party production file is not enumerated; an unloaded file counts as zero');
  if (!gate.passed || JSON.stringify(gate.files.map((entry) => entry.file).sort()) !== JSON.stringify(production)) problems.push('coverage: the full production set is not enumerated and loaded');
  for (const entry of gate.files) {
    if (!entry.loaded || entry.nestedExit !== 0 || [entry.lines, entry.branches, entry.functions].some((value) => value < 85)) problems.push(`coverage: ${entry.file} is below EACH-file 85/85/85 or unloaded`);
    if (!entry.rawCapture) { problems.push(`coverage: ${entry.file} has no raw individual command`); continue; }
    const raw = json(root, entry.rawCapture);
    const output = streams(root, entry.rawCapture, raw, problems).stdout;
    const row = new RegExp(`^#\\s+${entry.file.replaceAll('.', '\\.')}\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|`, 'm').exec(output);
    if (!row || JSON.stringify(row.slice(1, 4).map(Number)) !== JSON.stringify([entry.lines, entry.branches, entry.functions]) || raw.exitCode !== 0) problems.push(`coverage: ${entry.file} differs from its actual raw row or is unloaded`);
    for (const threshold of ['--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85']) if (!raw.command.includes(threshold)) problems.push(`coverage: ${entry.file} omits ${threshold}`);
    if (!raw.command.includes(`--test-coverage-include=**/C010/${entry.file}`)) problems.push(`coverage: ${entry.file} is not measured individually`);
  }
  for (const mode of ['lf', 'crlf']) {
    const result = json(root, `${FINAL}fresh-${mode}.report.json`);
    if (result.mode !== mode || result.exit !== 0 || result.fail || result.cancelled || result.skipped || result.tests !== result.pass || result.files !== wanted.length) problems.push(`fresh: ${mode} did not pass every non-evidence file`);
    const output = streams(root, `${FINAL}fresh-${mode}.report.json`, result, problems).stdout;
    for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped']) {
      const count = Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(output)?.[1]);
      if (count !== result[name]) problems.push(`fresh: ${mode} ${name} differs from the original raw stream`);
    }
  }
  const readme = read(root, 'README.md').toString('utf8');
  if (!readme.includes('806 original positions') || !readme.includes('810 generated positions') || !readme.includes('17 equivalents') || /The campaign is NOT complete/.test(readme)) problems.push('README: current measured campaign limits/counts are missing or contradictory');
  const block = /<!-- u057:begin -->\s*```json\s*([\s\S]*?)```\s*<!-- u057:end -->/.exec(readme);
  if (!block) problems.push('README: the current measured U057 figures block is missing');
  else {
    const printed = JSON.parse(block[1]);
    const report = json(root, CAMPAIGN);
    for (const key of ['generated', 'executed', 'killed', 'survived', 'undecided', 'notExecuted']) if (printed[key] !== report[key]) problems.push(`README: U057 ${key} differs from the actual report`);
    if (printed.originalPositions !== 806 || printed.equivalents !== report.survivedEquivalent || printed.kanoCredit !== 0) problems.push('README: original positions, equivalents or zero credit differ');
    const limits = observed.find((item) => item.kind === 'default-readback')?.limits;
    if (JSON.stringify(printed.limits) !== JSON.stringify(limits)) problems.push('README: default limits differ from real server readback');
  }
  const diagnosticFile = `${FINAL}c009-default-header.json`;
  const diagnosticManifest = json(root, diagnosticFile);
  const diagnostic = JSON.parse(streams(root, diagnosticFile, diagnosticManifest, problems).stdout);
  const sourceSnapshot = json(root, ADDENDUM).sourceSnapshots.C009;
  for (const input of diagnostic.inputs) {
    const recorded = sourceSnapshot.files.find((entry) => entry.path === input.path);
    if (!recorded || recorded.rawSha256 !== input.rawSha256 || recorded.lfSha256 !== input.lfSha256) problems.push(`C009 diagnostic: ${input.path} differs from its accepted read-only snapshot identity`);
  }
  if (diagnostic.inputs.length !== 9 || !sourceSnapshot.observationOnly || !diagnostic.unchangedState || !diagnostic.cleanup.listenerClosed || diagnostic.cleanup.connections !== 0) problems.push('C009 diagnostic: read-only scope or owned cleanup is incomplete');
}

function verify(root) {
  const problems = [];
  for (const check of [inventoryChecks, originalChecks, captureChecks, mutationChecks, semanticChecks]) {
    try { check(root, problems); } catch (error) { problems.push(`${check.name}: ${error.message}`); }
  }
  return problems;
}

module.exports = { ADDENDUM, HEAD, ORIGINAL, CAMPAIGN, FINAL, PHASE_INPUTS, captureChecks, inventoryChecks, json, lf, matches, mutationChecks, names, originalChecks, ownList, pin, read, rel, semanticChecks, sha, streams, verify };
