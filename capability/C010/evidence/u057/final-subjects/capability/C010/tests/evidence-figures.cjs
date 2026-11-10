'use strict';

// Test tooling, not production code: what the final captures of C010 show (figuresOf), the checks that read their meaning (the RED failed on assertions,
// the replay is the same command, the suite enumerates every file, the coverage floors, the mutation and guard campaigns are complete, the load loop and
// the fresh trees passed) and the one block of figures that the README prints and a test recomputes. Every figure the README states about the evidence
// lives in that block. Files are read through evidence-io.cjs (the real tree, or an overlay in a tamper test).
const path = require('node:path');
const fs = require('./evidence-io.cjs');
const { PRODUCTION, matchesRaw } = require('./evidence-pins.cjs');
const { readJson, transcriptText, tryJson, verifyReportInputs } = require('./evidence-verify.cjs');

const NAMES = Object.freeze({
  red: 'red/red-03-ownership-behavior.json', replay: 'green/green-04-ownership-behavior.json', suite: 'green/green-05-whole-suite.json', coverage: 'coverage/coverage-02-per-file.json',
  edge: 'browser/browser-02-edge.json', mutation: 'mutation/mutation-02.report.json', guard: 'mutation/guard-01.report.json', perFile: 'loop/perfile-01.json', loop: 'loop/loop-01.json',
  freshLf: 'fresh/fresh-lf-01.json', freshCrlf: 'fresh/fresh-crlf-01.json'
});
const MARKERS = Object.freeze(['<!-- figures:begin -->', '<!-- figures:end -->']);
const LOOPED = Object.freeze(['flood.test.cjs', 'flood-pending.test.cjs', 'oracle.test.cjs', 'pipeline-process-a.test.cjs', 'pipeline-process-b.test.cjs', 'pipeline-process-c.test.cjs']);
const CAP_MS = 60000;
const GUARD_MUTANTS = 66;
// The only captures that a run may leave out, and only on the order's minute-210 rule: evidence\uncaptured.json then says so, with the reason. A declared gap is
// printed by the README figures block as UNCAPTURED (it can never read as a pass), the capture itself may then be missing, and a capture that IS there contradicts it.
const UNCAPTURABLE = Object.freeze(['mutation', 'guard', 'loop']);

function uncapturedOf(root) {
  const declaration = tryJson(path.join(root, 'evidence', 'uncaptured.json'));
  return declaration && declaration.schema === 'C010-uncaptured/1' && declaration.items && typeof declaration.items === 'object' ? declaration.items : {};
}

function uncapturedChecks(root, problems) {
  for (const [key, item] of Object.entries(uncapturedOf(root))) {
    if (!UNCAPTURABLE.includes(key)) problems.push(`evidence/uncaptured.json: ${key} is not a capture that may be left out`);
    else if (!item || typeof item.reason !== 'string' || item.reason.length < 40) problems.push(`evidence/uncaptured.json: ${key} has no reason`);
  }
}

const at = (root, key) => path.join(root, 'evidence', NAMES[key]);
const manifest = (root, key) => ({ file: at(root, key), json: tryJson(at(root, key)) });
const testFiles = (root) => fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs')).sort();
const slowest = (perFile) => Object.entries(perFile).reduce((best, entry) => (entry[1].maxMs > best[1].maxMs ? entry : best));
const missing = (root, key, problems) => { const found = manifest(root, key); if (!found.json) problems.push(`evidence/${NAMES[key]}: the final capture is missing`); return found; };

// The figures of the final captures, or null for a capture that is missing or unreadable (the checks name it).
function figuresOf(root) {
  const figures = {};
  const summary = (key) => { const { json } = manifest(root, key); return json ? { tests: json.summary.tests, pass: json.summary.pass, fail: json.summary.fail } : null; };
  figures.red = summary('red');
  figures.replay = summary('replay');
  const suite = manifest(root, 'suite');
  figures.suite = suite.json ? { files: suite.json.command.filter((arg) => arg.endsWith('.test.cjs')).length, ...summary('suite') } : null;
  const coverage = manifest(root, 'coverage');
  const gate = coverage.json ? (() => { const text = transcriptText(coverage.file, coverage.json, 'stdout') ?? ''; try { return JSON.parse(text.slice(text.indexOf('{\n'), text.lastIndexOf('\n}') + 2)); } catch { return null; } })() : null;
  figures.coverage = gate ? Object.fromEntries(gate.files.map((item) => [item.file, [item.lines, item.branches, item.functions]])) : null;
  const edge = manifest(root, 'edge');
  figures.edge = edge.json ? (/Edge (\d+\.\d+\.\d+\.\d+)/.exec(transcriptText(edge.file, edge.json, 'stdout') ?? '') ?? [])[1] ?? null : null;
  const mutation = tryJson(at(root, 'mutation'));
  figures.mutation = mutation ? {
    generated: mutation.generated, executed: mutation.executed, killed: mutation.killed, killedByRetest: mutation.killedByRetest, equivalent: mutation.survivedEquivalent, survived: mutation.survived, undecided: mutation.undecided,
    notExecuted: mutation.notExecuted, perFile: Object.fromEntries(Object.entries(mutation.perFile).map(([file, entry]) => [file, entry.generated]))
  } : null;
  const guard = tryJson(at(root, 'guard'));
  figures.guardMutants = guard ? { total: guard.total, killed: guard.killed } : null;
  const perFile = tryJson(at(root, 'perFile'));
  figures.perFile = perFile ? { files: Object.keys(perFile.perFile).length, passed: Object.values(perFile.perFile).filter((entry) => entry.passed === entry.runs).length, slowestFile: slowest(perFile.perFile)[0], slowestMs: slowest(perFile.perFile)[1].maxMs } : null;
  const loop = tryJson(at(root, 'loop'));
  figures.loop = loop ? {
    files: Object.keys(loop.perFile).length, runsPerFile: loop.rounds, burners: loop.burners, parallel: loop.parallel, passed: Object.values(loop.perFile).reduce((sum, entry) => sum + entry.passed, 0),
    runs: Object.values(loop.perFile).reduce((sum, entry) => sum + entry.runs, 0), slowestFile: slowest(loop.perFile)[0], slowestMs: slowest(loop.perFile)[1].maxMs, overCap: Object.values(loop.perFile).reduce((sum, entry) => sum + entry.overCap, 0)
  } : null;
  const fresh = (key) => { const json = tryJson(at(root, key)); return json ? { files: json.files, tests: json.tests, pass: json.pass } : null; };
  figures.fresh = { lf: fresh('freshLf'), crlf: fresh('freshCrlf') };
  const declared = uncapturedOf(root);
  for (const [key, figure] of [['mutation', 'mutation'], ['guard', 'guardMutants'], ['loop', 'loop']]) {
    if (declared[key]) figures[figure] = { status: 'UNCAPTURED', reason: declared[key].reason, ...(figures[figure] ?? {}) };
  }
  return figures;
}

const renderFigures = (figures) => `${MARKERS[0]}\n\`\`\`json\n${JSON.stringify(figures, null, 1)}\n\`\`\`\n${MARKERS[1]}`;

function readmeFigures(root) {
  const text = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replaceAll('\r\n', '\n');
  const from = text.indexOf(MARKERS[0]);
  const to = text.indexOf(MARKERS[1]);
  return from < 0 || to < 0 ? null : text.slice(from, to + MARKERS[1].length);
}

function readmeChecks(root, problems) {
  const printed = readmeFigures(root);
  if (printed === null) problems.push('README: the figures block is missing');
  else if (printed !== renderFigures(figuresOf(root))) problems.push('README: the figures block differs from the figures recomputed from the evidence');
}

function redChecks(root, problems) {
  const red = missing(root, 'red', problems);
  const replay = missing(root, 'replay', problems);
  if (red.json) {
    const stdout = transcriptText(red.file, red.json, 'stdout') ?? '';
    if (red.json.exitCode !== 1 || !(red.json.summary.fail > 0)) problems.push(`evidence/${NAMES.red}: the RED did not fail`);
    if (!/AssertionError|ERR_ASSERTION/.test(stdout)) problems.push(`evidence/${NAMES.red}: the RED failed on no assertion`);
    if (/MODULE_NOT_FOUND|Cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/.test(stdout)) problems.push(`evidence/${NAMES.red}: the RED failed on a missing module or a syntax error`);
    if (!(red.json.environmentAdded || []).includes('C010_SUBJECT_DIR')) problems.push(`evidence/${NAMES.red}: the RED did not run against the retained stub`);
  }
  if (red.json && replay.json) {
    if (JSON.stringify(replay.json.command) !== JSON.stringify(red.json.command)) problems.push(`evidence/${NAMES.replay}: the replay is not the RED command unchanged`);
    if (red.json.command.filter((arg) => arg.endsWith('.test.cjs')).length === 0) problems.push(`evidence/${NAMES.red}: the RED names no test file`);
    if (replay.json.environmentAdded) problems.push(`evidence/${NAMES.replay}: the replay carries an environment override`);
    if (replay.json.exitCode !== 0 || replay.json.summary.fail !== 0 || replay.json.summary.pass !== replay.json.summary.tests) problems.push(`evidence/${NAMES.replay}: the replay did not pass`);
    if (replay.json.summary.tests !== red.json.summary.tests) problems.push(`evidence/${NAMES.replay}: the replay ran another number of tests than the RED`);
    const names = (found, pattern) => new Set([...(transcriptText(found.file, found.json, 'stdout') ?? '').matchAll(pattern)].map((match) => match[1].trim()).filter((name) => !/\.cjs$/.test(name)));
    const replayPassed = names(replay, /^ok \d+ - (.+)$/gm);
    for (const name of names(red, /^(?:not )?ok \d+ - (.+)$/gm)) if (!replayPassed.has(name)) problems.push(`evidence/${NAMES.replay}: the RED test "${name.slice(0, 80)}" does not pass in the replay`);
  }
}

function suiteChecks(root, problems) {
  const suite = missing(root, 'suite', problems);
  if (!suite.json) return;
  const listed = suite.json.command.filter((arg) => arg.endsWith('.test.cjs')).map((arg) => arg.split('\\').pop()).sort();
  const expected = testFiles(root).filter((name) => name !== 'evidence.test.cjs');
  if (JSON.stringify(listed) !== JSON.stringify(expected)) problems.push(`evidence/${NAMES.suite}: the GREEN run did not enumerate every test file but evidence.test.cjs`);
  const s = suite.json.summary;
  if (s.pass !== s.tests || s.fail || s.cancelled || s.skipped || s.todo || !(s.tests > 150)) problems.push(`evidence/${NAMES.suite}: not every test passed (or nothing ran)`);
}

function coverageChecks(root, problems) {
  const coverage = missing(root, 'coverage', problems);
  if (!coverage.json) return;
  const gate = figuresOf(root).coverage;
  if (!gate || JSON.stringify(Object.keys(gate).sort()) !== JSON.stringify([...PRODUCTION].sort())) problems.push(`evidence/${NAMES.coverage}: the gate does not name exactly the production files`);
  else for (const [file, figure] of Object.entries(gate)) if (figure.some((value) => value < 85)) problems.push(`evidence/${NAMES.coverage}: ${file} is below 85/85/85`);
  const text = transcriptText(coverage.file, coverage.json, 'stdout') ?? '';
  if (!/"passed": true/.test(text) || /UNLOADED_COUNTS_AS_ZERO/.test(text) || /"nestedExit": [1-9]/.test(text)) problems.push(`evidence/${NAMES.coverage}: the gate did not pass cleanly`);
}

function edgeChecks(root, problems) {
  const edge = missing(root, 'edge', problems);
  if (edge.json && !/msedge|Edge \d+\./i.test(transcriptText(edge.file, edge.json, 'stdout') ?? '')) problems.push(`evidence/${NAMES.edge}: the transcript shows no Edge run`);
}

// The equivalents file is a CommonJS module; it is read through the same file system as everything else and evaluated here.
function equivalentsOf(root) {
  const file = path.join(root, 'tests', 'mutants-equivalent.cjs');
  if (!fs.existsSync(file)) return {};
  const holder = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(holder, holder.exports);
  return holder.exports;
}

function mutationChecks(root, problems) {
  const where = `evidence/${NAMES.mutation}`;
  const report = tryJson(at(root, 'mutation'));
  if (!report) { problems.push(`${where}: the final capture is missing`); return; }
  const lines = (suffix) => (fs.existsSync(`${at(root, 'mutation')}${suffix}`) ? fs.readFileSync(`${at(root, 'mutation')}${suffix}`, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);
  const latest = new Map(lines('.jsonl').map((entry) => [`${entry.file}: ${entry.label}`, entry]));
  if (latest.size !== report.executed || report.results.length !== report.executed) problems.push(`${where}: the report does not count the mutants of its own raw results`);
  const gap = uncapturedOf(root).mutation;
  const complete = report.survived === 0 && report.undecided === 0 && report.notExecuted === 0 && report.executed === report.generated;
  if (gap) {
    // A declared partial run: every executed mutant is decided, and the declaration states exactly how many were not executed.
    if (!(report.survived === 0 && report.undecided === 0 && report.notExecuted > 0 && gap.notExecuted === report.notExecuted)) problems.push(`${where}: the declared gap does not match the report (survived ${report.survived}, undecided ${report.undecided}, not executed ${report.notExecuted}, declared ${gap.notExecuted})`);
  } else if (!complete) problems.push(`${where}: the campaign is not complete (survived ${report.survived}, undecided ${report.undecided}, not executed ${report.notExecuted})`);
  const green = new Set(report.baseline.filter((step) => step.exitCode === 0).map((step) => step.stage));
  if (report.baseline.length === 0 || report.baseline.some((step) => step.exitCode !== 0)) problems.push(`${where}: an unmutated control failed`);
  const equivalent = equivalentsOf(root);
  for (const entry of report.results) {
    const key = `${entry.file}: ${entry.label}`;
    if (entry.killed && !(entry.failingTests.length > 0 && green.has(entry.stage))) problems.push(`${where}: ${key} was killed by no named test in a stage with a green control`);
    if (!entry.killed && !entry.equivalent) problems.push(`${where}: ${key} neither killed nor listed equivalent`);
    if (entry.equivalent && entry.equivalent !== equivalent[key]) problems.push(`${where}: ${key} equivalence differs from tests/mutants-equivalent.cjs`);
    if (entry.equivalent && entry.killed) problems.push(`${where}: ${key} is listed equivalent but was killed`);
  }
  const survivors = new Set(report.results.filter((entry) => !entry.killed).map((entry) => `${entry.file}: ${entry.label}`));
  for (const [key, reason] of Object.entries(equivalent)) {
    if (!survivors.has(key)) problems.push(`${where}: the equivalent list names ${key}, which is not a surviving mutant of the report`);
    if (String(reason).length < 40) problems.push(`${where}: the proof for ${key} is not a sentence`);
  }
  const campaign = report.campaign;
  if (!campaign) { problems.push(`${where}: the report has no start record`); return; }
  for (const [name, hash] of Object.entries(campaign.files)) {
    const target = path.join(root, name);
    if (!fs.existsSync(target)) problems.push(`${where}: ${name} of the campaign is missing`);
    else if (!matchesRaw(target, hash)) problems.push(`${where}: ${name} changed after the campaign started`);
  }
  if (!matchesRaw(path.join(root, 'tests', 'mutate-gen.cjs'), campaign.generator)) problems.push(`${where}: tests/mutate-gen.cjs changed after the campaign started`);
  for (const retest of report.retests || []) {
    for (const [name, hash] of Object.entries(retest.files)) if (!fs.existsSync(path.join(root, name)) || !matchesRaw(path.join(root, name), hash)) problems.push(`${where}: ${name} of a retest changed or is missing`);
    if (Object.keys(retest.files).some((name) => Object.hasOwn(campaign.files, name))) problems.push(`${where}: a retest names a test file that existed when the campaign started (old test files are never edited, only added)`);
  }
}

function guardChecks(root, problems) {
  const where = `evidence/${NAMES.guard}`;
  const guard = tryJson(at(root, 'guard'));
  if (uncapturedOf(root).guard) { if (guard) problems.push(`${where}: declared UNCAPTURED in evidence/uncaptured.json but a capture exists`); return; }
  if (!guard) { problems.push(`${where}: the final capture is missing`); return; }
  verifyReportInputs(root, where, guard, problems);
  if (!(guard.total === GUARD_MUTANTS && guard.killed === guard.total && guard.survived === 0 && guard.undecided === 0 && guard.badPattern === 0 && guard.control.every((entry) => entry.exitCode === 0 && !entry.timedOut))) problems.push(`${where}: not every guard mutant was killed by a named test (or the control failed)`);
  for (const result of guard.results) if (result.status !== 'KILLED' || !result.killedBy || !(result.failed || []).length) problems.push(`${where}: ${result.id} has no named failing test`);
}

function loopChecks(root, problems) {
  const files = testFiles(root).filter((name) => name !== 'evidence.test.cjs');
  for (const [key, expectFiles, burners, rounds, parallel] of [['perFile', files, 0, 1, 1], ['loop', [...LOOPED], 4, 20, 4]]) {
    const where = `evidence/${NAMES[key]}`;
    const report = tryJson(at(root, key));
    if (key === 'loop' && uncapturedOf(root).loop) { if (report) problems.push(`${where}: declared UNCAPTURED in evidence/uncaptured.json but a capture exists`); continue; }
    if (!report) { problems.push(`${where}: the final capture is missing`); continue; }
    verifyReportInputs(root, where, report, problems);
    if (JSON.stringify(Object.keys(report.perFile).sort()) !== JSON.stringify([...expectFiles].sort())) problems.push(`${where}: it does not run exactly the expected files`);
    if (report.burners !== burners || report.rounds !== rounds || report.parallel !== parallel) problems.push(`${where}: burners ${report.burners}, rounds ${report.rounds}, parallel ${report.parallel} are not ${burners}, ${rounds}, ${parallel}`);
    if (key === 'loop' && report.burnerPids.length !== burners) problems.push(`${where}: the PIDs of the burners are not recorded`);
    for (const [file, entry] of Object.entries(report.perFile)) {
      if (entry.passed !== entry.runs || entry.runs !== rounds) problems.push(`${where}: ${file} passed ${entry.passed} of ${entry.runs} runs (${rounds} wanted)`);
      if (key === 'perFile' && entry.maxMs >= CAP_MS) problems.push(`${where}: ${file} took ${entry.maxMs} ms, over the 60 s per-file cap, on a machine without burners`);
    }
    if (report.runs.length !== Object.values(report.perFile).reduce((sum, entry) => sum + entry.runs, 0)) problems.push(`${where}: the runs do not add up`);
  }
}

function freshChecks(root, problems) {
  for (const [key, mode] of [['freshLf', 'lf'], ['freshCrlf', 'crlf']]) {
    const where = `evidence/${NAMES[key]}`;
    const report = tryJson(at(root, key));
    if (!report) { problems.push(`${where}: the final capture is missing`); continue; }
    verifyReportInputs(root, where, report, problems);
    if (report.mode !== mode || report.exit !== 0 || report.fail !== 0 || report.cancelled !== 0 || report.skipped !== 0 || !(report.tests > 150) || report.pass !== report.tests) problems.push(`${where}: the whole suite did not pass in the ${mode} tree`);
    if (report.evidenceTest !== false || report.files !== testFiles(root).length - 1) problems.push(`${where}: it did not run every test file but evidence.test.cjs`);
  }
}

// All the checks that read the MEANING of the final captures, and the README block.
function checksOf(root, problems) {
  for (const check of [redChecks, suiteChecks, coverageChecks, edgeChecks, mutationChecks, guardChecks, loopChecks, freshChecks, uncapturedChecks, readmeChecks]) check(root, problems);
}

module.exports = Object.freeze({ CAP_MS, GUARD_MUTANTS, LOOPED, MARKERS, NAMES, UNCAPTURABLE, checksOf, coverageChecks, edgeChecks, figuresOf, freshChecks, guardChecks, loopChecks, mutationChecks, readJson, readmeChecks,
  readmeFigures, redChecks, renderFigures, suiteChecks, uncapturedChecks, uncapturedOf });
