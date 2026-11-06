'use strict';

// F8 (review of the first publication): every summary figure is RECOMPUTED from the stored transcripts and the DOM snapshot, never trusted from a
// summary field or from the README. `read` is injectable so a tampered copy is tested in memory. What this cannot detect is a CONSISTENT rewrite of a
// verifier together with every manifest and pin: only the published commit and tag detect that (L-0096).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { sha, root } = require('.\\evidence-check.cjs');

const fixDirectory = path.join(root, 'evidence', 'fix');
const read = (target) => fs.readFileSync(target);
const stdout = (file, reader) => {
  const manifest = JSON.parse(reader(file).toString('utf8'));
  return { manifest, text: zlib.gunzipSync(reader(path.join(path.dirname(file), manifest.transcripts.stdout.path))).toString('utf8').replace(/\r\n/g, '\n') };
};
const tapCount = (text, name) => { const match = new RegExp(`^# ${name} (\\d+)$`, 'm').exec(text); return match ? Number(match[1]) : null; };

// A node --test run: the counts of the TAP footer against the manifest summary the recorder wrote.
function suite(file, reader = read) {
  const { manifest, text } = stdout(file, reader);
  const figures = Object.fromEntries(['tests', 'pass', 'fail', 'skipped', 'todo', 'cancelled'].map((name) => [name, tapCount(text, name)]));
  const problems = [];
  for (const [name, value] of Object.entries(figures)) if (manifest.summary[name] !== value) problems.push(`summary.${name} is ${manifest.summary[name]} but the transcript says ${value}`);
  if (figures.tests === null || figures.pass !== figures.tests || figures.fail !== 0 || figures.skipped !== 0 || figures.todo !== 0 || figures.cancelled !== 0) problems.push('the run is not all green');
  const notOk = [...text.matchAll(/^not ok \d+ - (.+)$/gm)].length;
  if (notOk !== figures.fail) problems.push(`the transcript has ${notOk} failing tests but says ${figures.fail}`);
  return { figures, problems };
}

// The per-file coverage gate: the JSON line of tests\coverage.cjs against the Node coverage row each figure came from.
function coverage(file, reader = read) {
  const { text } = stdout(file, reader);
  const line = text.trim().split('\n').pop();
  const report = JSON.parse(line);
  const problems = [];
  const figures = {};
  for (const entry of report.coverage) {
    const row = new RegExp(`^#\\s+${entry.file.replace('.', '\\.')}\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|`).exec(entry.row || '');
    const own = [entry.lines, entry.branches, entry.functions];
    if (!row || row.slice(1, 4).map(Number).some((value, index) => value !== own[index])) problems.push(`${entry.file}: the figures differ from the Node coverage row they were read from`);
    if (own.some((value) => !(value >= report.threshold)) || !entry.passed || entry.nodeExit !== 0 || entry.failedTests !== 0 || !entry.loaded) problems.push(`${entry.file}: below ${report.threshold} or not passed`);
    figures[entry.file] = own;
  }
  if (!report.passed || report.threshold !== 85) problems.push('the gate did not pass at 85/85/85');
  const printed = [...text.matchAll(/^(\S+\.js)\s+lines\s+([\d.]+)\s+branches\s+([\d.]+)\s+functions\s+([\d.]+)\s+loaded true\s+node exit 0\s+PASS$/gm)].map((match) => [match[1], [match[2], match[3], match[4]].map(Number)]);
  if (JSON.stringify(printed) !== JSON.stringify(Object.entries(figures))) problems.push('the printed table differs from the JSON report');
  return { figures, problems };
}

// The mutation campaign: every count of the summary recomputed from the list of mutants. A report covers the files it names (`files`); the reviewer mutants of each
// named file must be killed in it (D1, D2, D6, D7 live in describe.js, P12 in page.js, B12 in timeline.js), so a campaign split per file stays checkable.
const REVIEWER_MUTANTS = { 'describe.js': ['D1-reconnects', 'D2-resyncs', 'D6-epoch-changes', 'D7-connection'], 'page.js': ['P12-verification'], 'timeline.js': ['B12-gap-position'] };
function mutants(file, reader = read) {
  const { text } = stdout(file, reader);
  const report = JSON.parse(text);
  const count = (outcome) => report.mutants.filter((item) => item.outcome === outcome).length;
  const figures = { generated: report.mutants.length, killed: count('killed'), equivalent: count('equivalent'), survived: count('SURVIVED'), perFile: {}, files: report.files };
  for (const item of report.mutants) figures.perFile[item.file] = (figures.perFile[item.file] || 0) + 1;
  const problems = [];
  const summary = report.summary;
  if (summary.generated !== figures.generated || summary.killed !== figures.killed || summary.equivalent !== figures.equivalent || summary.survived.length !== figures.survived) problems.push('the summary differs from the recomputed counts');
  if (figures.survived !== 0 || report.mutants.some((item) => item.outcome.startsWith('INVALID'))) problems.push('a mutant survived or was invalid');
  if (report.mutants.some((item) => item.outcome === 'TIMEOUT' || item.suite === 'timeout')) problems.push('a mutant timed out: its outcome is undecided');
  if (report.mutants.some((item) => item.outcome === 'killed' && !(item.by && item.by.length > 0))) problems.push('a mutant was killed without a named failing test');
  if (report.mutants.some((item) => item.outcome === 'equivalent' && !item.proof)) problems.push('an equivalent mutant has no proof');
  const pristine = report.pristine || {};
  for (const name of Object.keys(pristine)) if (pristine[name] !== 'passed') problems.push(`${name}: the unmutated suite did not pass under the campaign runner`);
  if (!report.pristine) problems.push('the campaign did not check that the unmutated suites pass');
  if (!Array.isArray(report.files) || report.files.length === 0 || report.files.some((name) => !(name in REVIEWER_MUTANTS))) problems.push('the report does not name its mutated files');
  for (const name of (report.files || []).flatMap((target) => REVIEWER_MUTANTS[target] || [])) {
    if (!report.mutants.some((item) => item.op.includes(name) && item.outcome === 'killed')) problems.push(`the reviewer mutant ${name} is not killed`);
  }
  return { figures, problems };
}

// The baseline of the campaign: every suite the campaign runs must pass UNMUTATED under the campaign's own minimal runner (otherwise every mutant would count as killed).
function pristine(file, reader = read) {
  const report = JSON.parse(stdout(file, reader).text);
  const names = Object.keys(report.pristine || {});
  const problems = [];
  if (names.length === 0) problems.push('the baseline names no suite');
  for (const name of names) if (report.pristine[name] !== 'passed') problems.push(`${name}: the unmutated suite did not pass under the campaign runner`);
  if (report.generated !== 0 || !Array.isArray(report.mutants) || report.mutants.length !== 0) problems.push('a baseline run mutates nothing');
  return { figures: { suites: names.length }, problems };
}

// The real-browser observation: summary.json against the printed transcript of the run and the DOM snapshot against its own markup.
function browser(directory, transcript, reader = read) {
  const summaryPath = path.join(directory, 'summary.json');
  const summaryBytes = reader(summaryPath);
  const summary = JSON.parse(summaryBytes.toString('utf8'));
  const snapshotBytes = reader(path.join(directory, 'dom-restart-gap-position-17.html'));
  const html = snapshotBytes.toString('utf8');
  const printed = /^PASS all (\d+) browser checks \((\d+) positions, (\d+) key actions\) on Edge (\S+)$/m.exec(transcript);
  const written = /summarySha256=([0-9a-f]{64}) snapshotSha256=([0-9a-f]{64})/.exec(transcript);
  const problems = [];
  if (!printed || !written) return { figures: {}, problems: ['the transcript has no final PASS line or no evidence line'] };
  if (Number(printed[1]) !== summary.checks.length) problems.push('checks differ from the transcript');
  if (Number(printed[2]) !== summary.counts.positionsChecked) problems.push('positionsChecked differs from the transcript');
  if (Number(printed[3]) !== summary.counts.actions) problems.push('actions differ from the transcript');
  if (printed[4] !== summary.browserVersion || printed[4] !== summary.edge.version) problems.push('edge.version differs from the transcript');
  if (sha(summaryBytes) !== written[1]) problems.push('summary.json differs from the digest the run printed');
  if (sha(snapshotBytes) !== written[2] || written[2] !== summary.snapshotSha256) problems.push('the DOM snapshot differs from the digest the run printed');
  const rows = [...html.matchAll(/<li id="entry-(\d+)"/g)].map((match) => Number(match[1]));
  const lines = [...html.matchAll(/<dd\b[^>]*\bid="(st-[a-z-]+)"/g)].map((match) => match[1]);
  if (rows.length !== 44 || rows.some((value, index) => value !== index + 1)) problems.push('the DOM snapshot does not list the 44 entries of the run once each');
  if (lines.length !== 16 || new Set(lines).size !== 16) problems.push('the DOM snapshot does not show the sixteen console state lines once each');
  if (!html.includes('Position 17 of 44')) problems.push('the DOM snapshot is not position 17 of 44');
  return { figures: { checks: summary.checks.length, positionsChecked: summary.counts.positionsChecked, actions: summary.counts.actions, edge: summary.edge.version }, problems };
}

// The figures a README states in its machine-readable block, as { name: value } strings.
function readmeFigures(text) {
  const block = /<!-- figures:begin -->\n([\s\S]*?)<!-- figures:end -->/.exec(text.replace(/\r\n/g, '\n'));
  if (!block) return null;
  return Object.fromEntries(block[1].split('\n').filter(Boolean).map((line) => { const [name, ...rest] = line.split(': '); return [name, rest.join(': ')]; }));
}

module.exports = Object.freeze({ suite, coverage, mutants, pristine, browser, readmeFigures, tapCount, fixDirectory, REVIEWER_MUTANTS });
