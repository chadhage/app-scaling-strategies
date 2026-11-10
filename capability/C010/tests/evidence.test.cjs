'use strict';

if (require('node:fs').existsSync(require('node:path').join(__dirname, '..', 'evidence', 'u057', 'original-subjects.json'))) {
  const assert = require('node:assert/strict');
  const test = require('node:test');
  const evidence = require('./evidence-u057.cjs');
  const root = require('node:path').resolve(__dirname, '..');
  test('U057 report.generated equals the generator OWN --list total, not a copied fixture count', () => {
    assert.equal(evidence.json(root, evidence.CAMPAIGN).generated, evidence.ownList(root).total);
  });
  require('./evidence-u057.check.cjs');
} else {

// The archived evidence of C010 (rev-C010 m4): every manifest of every capture is recomputed (transcripts, counts, exit codes, the pinned inputs: a
// final capture pins EVERY input file), the final captures are read for what they mean (the RED failed on assertions against the retained stub and
// replays unchanged, the suite enumerates every file, per-file coverage, the complete mutation campaign, the 66 guard mutants, the load loop, the
// fresh trees), the README prints ONE block of figures that is recomputed from those manifests, and seal.json pins the final bytes of the README, the
// feature, imports.json, every production file, every test file and every evidence file that no manifest pins by itself. A TAMPER test per branch
// shows that an altered byte or a consistent rewrite of a README figure is detected BY NAME: each alteration is an overlay over the real tree
// (evidence-io.cjs), so no copy of the namespace is made and no file is written. A consistent rewrite of a capture together with its inputs and the
// seal is not detectable here: the published commit and tag are the anchor.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const io = require('./evidence-io.cjs');
const { lf, sha } = require('./evidence-pins.cjs');
const { buildSeal, verify, verifyArchive, verifySeal, walk } = require('./evidence-verify.cjs');
const figures = require('./evidence-figures.cjs');

const { NAMES } = figures;
const root = path.resolve(__dirname, '..');
const problems = verify(root, { checks: [figures.checksOf] });
const about = (pattern) => problems.filter((problem) => pattern.test(problem));

for (const [label, pattern] of [
  ['every archived manifest recomputes: transcripts, counts, exit codes and the pinned inputs of every final capture', /(gzip|stream hash|size differs|summary|exit \d|is missing|does not pin|differs from its pin|not valid)/],
  ['the RED failed on assertions against the retained naive stub (not on a missing module) and the replay is the same command, unchanged, now passing', new RegExp(`${NAMES.red}|${NAMES.replay}`)],
  ['the whole suite was green: every test file but this one, nothing skipped or cancelled', new RegExp(NAMES.suite)],
  ['per-file coverage: one command per production file, every file at or above 85/85/85', new RegExp(NAMES.coverage)],
  ['the real isolated Edge run is archived', new RegExp(NAMES.edge)],
  ['the mutation campaign is complete: every generated mutant was decided, every kill names a test, every survivor is a listed equivalent with its proof', new RegExp(NAMES.mutation)],
  ['the 66 guard mutants of the independent review are all killed by named tests', new RegExp(NAMES.guard)],
  ['the load loop and the per-file pass: every run passed, the figures are recorded', new RegExp(`${NAMES.loop}|${NAMES.perFile}`)],
  ['the fresh-checkout runs: the whole suite but this file passed in an LF tree and in a CRLF tree', /evidence\/fresh\//],
  ['the retained captures of the first publication are all there', /retained capture/],
  ['the README prints the figures of the evidence and no other', /^README:/],
  ['the seal pins the final bytes of everything and nothing is unsealed', /^seal:|seal\.json/]
]) {
  test(label, () => assert.deepEqual(about(pattern), []));
}

test('nothing at all is wrong with the archive', () => assert.deepEqual(problems, []));

// An alteration is a list of [absolute path, Buffer | null]; `found` runs checks over the tree as it would be with that alteration.
const file = (...parts) => path.join(root, ...parts);
const evidence = (name) => file('evidence', name);
const read = (target) => io.readFileSync(target);
const flipped = (target, offset = 5) => { const bytes = Buffer.from(read(target)); bytes[offset % bytes.length] ^= 1; return bytes; };
const edited = (target, change) => { const json = JSON.parse(read(target).toString('utf8')); change(json); return Buffer.from(`${JSON.stringify(json, null, 1)}\n`); };
const found = (edits, ...checks) => io.withEdits(new Map(edits), () => { const list = []; for (const check of checks) check(root, list); return list; });
const named = (edits, pattern, ...checks) => found(edits, ...checks).some((problem) => pattern.test(problem));
// A consistent rewrite: the seal rebuilt over the altered tree, so only the checks that read the MEANING of the evidence can still object.
const resealed = (edits) => [...edits, [evidence('seal.json'), io.withEdits(new Map(edits), () => Buffer.from(`${JSON.stringify(buildSeal(root), null, 1)}\n`))]];
const gz = (folder, prefix) => walk(evidence(folder)).find((candidate) => path.basename(candidate).startsWith(prefix) && candidate.endsWith('.stdout.raw.gz'));
const escape = (name) => name.replace(/[.]/g, '\\.');

test('TAMPER: a flipped byte of a raw transcript, a truncated one, a deleted one, a forged manifest hash, a forged count and a forged exit code are each detected by name', () => {
  assert.ok(named([[gz('green', 'green-05'), flipped(gz('green', 'green-05'), 20)]], /green-05.*stdout gzip hash differs/, verifyArchive));
  assert.ok(named([[gz('coverage', 'coverage-02'), read(gz('coverage', 'coverage-02')).subarray(0, 40)]], /coverage-02.*(gzip hash differs|not valid gzip)/, verifyArchive));
  assert.ok(named([[gz('browser', 'browser-02'), null]], /browser-02.*transcript .* is missing/, verifyArchive));
  assert.ok(named([[evidence(NAMES.red), edited(evidence(NAMES.red), (json) => { json.transcripts.stdout.sha256 = '0'.repeat(64); })]], /red-03.*stdout stream hash differs/, verifyArchive));
  assert.ok(named([[evidence(NAMES.suite), edited(evidence(NAMES.suite), (json) => { json.summary.pass += 1; })]], /green-05.*summary pass is not the transcript's/, verifyArchive));
  assert.ok(named([[evidence(NAMES.suite), edited(evidence(NAMES.suite), (json) => { json.exitCode = 1; })]], /green-05.*exit 1/, verifyArchive));
  assert.deepEqual(found([], verifyArchive), [], 'the untouched archive is clean');
});

test('TAMPER: one byte of the README, the feature, imports.json, a production file or a test file is detected by the seal, and so are an unsealed new test file, an unsealed new evidence file and a missing seal', () => {
  for (const name of ['README.md', 'C010.feature', 'imports.json', 'server.cjs', 'page.js', 'tests/idor.test.cjs', 'tests/helpers.cjs', 'tests/evidence.test.cjs']) {
    assert.ok(named([[file(name), flipped(file(name), 7)]], new RegExp(`seal: ${escape(name)} differs from its pin`), verifySeal), name);
  }
  assert.ok(named([[file('tests', 'extra.test.cjs'), Buffer.from('\'use strict\';\n')]], /seal: tests\/extra\.test\.cjs is not sealed/, verifySeal));
  assert.ok(named([[evidence('mutation/extra.json'), Buffer.from('{}')]], /seal: evidence\/mutation\/extra\.json is not sealed/, verifySeal));
  assert.ok(named([[evidence('seal.json'), null]], /evidence\/seal\.json is missing/, verifySeal));
  assert.deepEqual(found([], verifySeal), [], 'the untouched seal is clean');
});

test('TAMPER: a README figure that is changed is detected by name even where the seal is rebuilt over it; so is a missing figures block', () => {
  const text = read(file('README.md')).toString('utf8');
  const at = text.indexOf('"killed": ');
  assert.ok(at > 0, 'the README prints the mutation figures');
  const changed = Buffer.from(text.slice(0, at + 10) + (text[at + 10] === '9' ? '8' : '9') + text.slice(at + 11));
  assert.ok(named([[file('README.md'), changed]], /README: the figures block differs from the figures recomputed from the evidence/, figures.readmeChecks));
  assert.deepEqual(found(resealed([[file('README.md'), changed]]), verifySeal), [], 'the rebuilt seal accepts the changed README: only the figures check objects');
  const bare = Buffer.from(text.replace('<!-- figures:begin -->', ''));
  assert.ok(named([[file('README.md'), bare]], /README: the figures block is missing/, figures.readmeChecks));
});

test('TAMPER: one byte of any evidence file that no manifest pins by itself (a manifest field, the mutation, guard, loop and fresh reports, the stub) is detected by the seal', () => {
  for (const name of [NAMES.coverage, NAMES.mutation, `${NAMES.mutation}.jsonl`, `${NAMES.mutation}.start.json`, NAMES.guard, NAMES.loop, NAMES.perFile, NAMES.freshLf, NAMES.freshCrlf, 'red/stub/server.cjs', 'red/red-01-ownership-behavior.json']) {
    assert.ok(named([[evidence(name), flipped(evidence(name), 7)]], new RegExp(`seal: evidence/${escape(name)} differs from its pin`), verifySeal), name);
  }
  assert.ok(named([[evidence(NAMES.loop), Buffer.from('{')]], /loop-01\.json: is not valid JSON/, verifyArchive));
});

test('TAMPER: an input of a capture that changed after the capture (a test file, a production file, the feature) is detected through the manifests as well as the seal, and a capture that leaves an input unpinned is too', () => {
  for (const [name, capture] of [['server.cjs', /green-05.*input .*server\.cjs differs from its pin/], ['tests/commit.test.cjs', /red-03.*input .*commit\.test\.cjs differs from its pin/], ['C010.feature', /coverage-02.*input .*C010\.feature differs from its pin/]]) {
    assert.ok(named([[file(name), flipped(file(name), 11)]], capture, verifyArchive), name);
  }
  const unpinned = [[evidence(NAMES.suite), edited(evidence(NAMES.suite), (json) => { json.inputs = json.inputs.filter((input) => !input.path.endsWith('idor.test.cjs')); })]];
  assert.ok(named(unpinned, /green-05.*does not pin .*idor\.test\.cjs/, verifyArchive));
});

test('TAMPER: a retained capture cannot be removed, and the RED must be behavioral and replay unchanged, and the suite must enumerate every test file', () => {
  assert.ok(named([[evidence('red/red-01-ownership-behavior.json'), null]], /red-01-ownership-behavior\.json: the retained capture is missing/, verifyArchive));
  assert.ok(named([[evidence('mutation/mutation-01.report.json'), null]], /mutation-01\.report\.json: the retained capture is missing/, verifyArchive));
  assert.ok(named([[evidence(NAMES.red), edited(evidence(NAMES.red), (json) => { json.environmentAdded = []; })]], /red-03.*did not run against the retained stub/, figures.redChecks));
  assert.ok(named([[evidence(NAMES.replay), edited(evidence(NAMES.replay), (json) => { json.command = [...json.command, '--extra']; })]], /green-04.*not the RED command unchanged/, figures.redChecks));
  assert.ok(named([[evidence(NAMES.suite), edited(evidence(NAMES.suite), (json) => { json.command = json.command.filter((arg) => !arg.endsWith('store.test.cjs')); })]], /green-05.*did not enumerate every test file/, figures.suiteChecks));
  assert.ok(named([[evidence(NAMES.coverage), edited(evidence(NAMES.coverage), (json) => { json.exitCode = 1; })]], /coverage-02.*exit 1/, verifyArchive));
});

test('TAMPER: a mutation survivor, a kill without a named test, an unproven equivalent, a changed campaign input and a retest of an old test file are each detected by name', () => {
  const report = evidence(NAMES.mutation);
  const survivor = [[report, edited(report, (json) => { const killed = json.results.find((entry) => entry.killed); killed.killed = false; killed.failingTests = []; json.killed -= 1; json.survived += 1; })]];
  assert.ok(named(survivor, /mutation-02.*neither killed nor listed equivalent/, figures.mutationChecks));
  assert.ok(named(survivor, /mutation-02.*(the campaign is not complete|the declared gap does not match the report)/, figures.mutationChecks));
  assert.ok(named([[report, edited(report, (json) => { json.results.find((entry) => entry.killed).failingTests = []; })]], /mutation-02.*was killed by no named test/, figures.mutationChecks));
  assert.ok(named([[report, edited(report, (json) => { json.campaign.files['server.cjs'] = '0'.repeat(64); })]], /mutation-02.*server\.cjs changed after the campaign started/, figures.mutationChecks));
  assert.ok(named([[report, edited(report, (json) => { json.campaign.generator = '0'.repeat(64); })]], /mutation-02.*mutate-gen\.cjs changed after the campaign started/, figures.mutationChecks));
  assert.ok(named([[report, edited(report, (json) => { json.retests = [{ files: { 'tests/idor.test.cjs': '0'.repeat(64) } }]; })]], /mutation-02.*existed when the campaign started/, figures.mutationChecks));
  const bogus = [[file('tests', 'mutants-equivalent.cjs'), Buffer.from('\'use strict\';\nmodule.exports = Object.freeze({ \'page.js: operand "nothing" false @1:1\': \'a reason that is long enough to look like a sentence but names no mutant\' });\n')]];
  assert.ok(named(bogus, /the equivalent list names page\.js: operand "nothing" false @1:1, which is not a surviving mutant/, figures.mutationChecks));
});

test('TAMPER: a guard mutant that lives, a loop run that failed, a loop without burners, a per-file time over the cap, a fresh tree that failed and a fresh run that left an input unpinned are each detected by name', () => {
  const guard = evidence(NAMES.guard);
  if (io.existsSync(guard)) assert.ok(named([[guard, edited(guard, (json) => { json.results[0].status = 'SURVIVED'; json.killed -= 1; json.survived += 1; })]], /guard-01.*not every guard mutant was killed/, figures.guardChecks));
  if (io.existsSync(evidence(NAMES.loop))) {
    assert.ok(named([[evidence(NAMES.loop), edited(evidence(NAMES.loop), (json) => { Object.values(json.perFile)[0].passed -= 1; })]], /loop-01.*passed \d+ of \d+ runs/, figures.loopChecks));
    assert.ok(named([[evidence(NAMES.loop), edited(evidence(NAMES.loop), (json) => { json.burners = 0; json.burnerPids = []; })]], /loop-01.*burners 0/, figures.loopChecks));
  }
  assert.ok(named([[evidence(NAMES.perFile), edited(evidence(NAMES.perFile), (json) => { Object.values(json.perFile)[0].maxMs = 60000; })]], /perfile-01.*over the 60 s per-file cap/, figures.loopChecks));
  assert.ok(named([[evidence(NAMES.freshCrlf), edited(evidence(NAMES.freshCrlf), (json) => { json.fail = 1; json.exit = 1; })]], /fresh-crlf-01.*did not pass in the crlf tree/, figures.freshChecks));
  assert.ok(named([[evidence(NAMES.freshLf), edited(evidence(NAMES.freshLf), (json) => { json.inputs = json.inputs.filter((input) => input.path !== 'server.cjs'); })]], /fresh-lf-01.*does not pin server\.cjs/, figures.freshChecks));
});

test('TAMPER: a declared gap prints as UNCAPTURED and never passes for a capture: a declaration beside a capture, one for a capture that may not be left out, a reasonless one and a wrong count are each detected by name', () => {
  const declare = (items) => [evidence('uncaptured.json'), Buffer.from(`${JSON.stringify({ schema: 'C010-uncaptured/1', items }, null, 1)}\n`)];
  const reason = 'a reason of more than forty characters, said plainly';
  assert.ok(named([declare({ suite: { reason } })], /uncaptured\.json: suite is not a capture that may be left out/, figures.uncapturedChecks));
  assert.ok(named([declare({ guard: { reason: 'short' } })], /uncaptured\.json: guard has no reason/, figures.uncapturedChecks));
  assert.ok(named([declare({ mutation: { reason, notExecuted: -1 } })], /mutation-02.*the declared gap does not match the report/, figures.mutationChecks));
  for (const [key, check, figure] of [['guard', figures.guardChecks, 'guardMutants'], ['loop', figures.loopChecks, 'loop']]) {
    const capture = evidence(NAMES[key]);
    if (io.existsSync(capture)) {
      assert.ok(named([declare({ [key]: { reason } })], /declared UNCAPTURED in evidence\/uncaptured\.json but a capture exists/, check), `${key}: a declaration beside its capture`);
      const gone = [[capture, null], declare({ [key]: { reason } })];
      assert.equal(named(gone, /final capture is missing/, check), false, `${key}: a declared gap does not ask for the capture`);
      assert.equal(io.withEdits(new Map(gone), () => figures.figuresOf(root)[figure].status), 'UNCAPTURED', `${key}: the figures print UNCAPTURED`);
      assert.ok(named(gone, /README: the figures block differs from the figures recomputed/, figures.readmeChecks), `${key}: the README block must say UNCAPTURED too`);
    } else {
      assert.equal(figures.figuresOf(root)[figure].status, 'UNCAPTURED', `${key}: it is not captured, so the figures must say so`);
    }
  }
});

test('the README names every command the reviewer re-runs, and no file of the namespace carries a local identifier of the machine it was built on', () => {
  const readme = read(file('README.md')).toString('utf8');
  for (const command of ['C010_SUBJECT_DIR', 'coverage.cjs', 'browser.cjs', 'mutate-gen.cjs', 'guard-mutants.cjs', 'loop.cjs', 'fresh.cjs', 'seal.cjs', 'C010_GIT_REPOSITORY']) assert.ok(readme.includes(command), `the README has ${command}`);
  const hits = [];
  // Generic patterns, so that this file carries no identifier itself: a user-profile path of any machine and a session folder of the agent runtime.
  const forbidden = [/[A-Za-z]:[\\/]+Users[\\/]+(?!Public\b|Default\b|All Users\b)[^\\/\s"'`<>]+/i, /\.copilot[\\/]+session-state[\\/]+[0-9a-f]{8}-[0-9a-f]{4}-/i];
  for (const target of walk(root)) {
    const bytes = read(target);
    const text = target.endsWith('.gz') ? zlib.gunzipSync(bytes).toString('latin1') : bytes.toString('latin1');
    if (forbidden.some((pattern) => pattern.test(text))) hits.push(path.relative(root, target).split(path.sep).join('/'));
  }
  // The sealed transcript of the first publication's RED carries stack-trace paths (retained evidence cannot be scrubbed without breaking its pins).
  assert.deepEqual(hits.filter((name) => name !== 'evidence/red/raw/red-01-ownership-behavior.stdout.raw.gz'), []);
  assert.equal(sha(lf(Buffer.from('a\r\nb'))), sha(Buffer.from('a\nb')));
});
}
