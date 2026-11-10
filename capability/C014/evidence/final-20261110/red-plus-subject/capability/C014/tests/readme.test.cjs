'use strict';

// The README states claims and figures. This file ties each of them to something that can fail: (1) every row of the claims table to a test that exists, (2) every paragraph that says
// "pinned", "every", "whole", "never" or "always" to a row of that table, by a citation (a C and two digits in square brackets), (3) every FIGURE the prose states about the evidence (a count of
// tests, files, runs or mutants, a number of seconds, "N of M", a coverage triple) to a value DERIVED from the stored evidence, by the marker that follows it, where a figure of that kind
// without a marker is a failure by name, and (4) the lines about the fresh-checkout runs. The third review found 595, 581, 14, 120 of 120, 30.6 s and 137 in prose that no test recomputed,
// and a claim ("masks the WHOLE value") that no test pinned and that was false.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { ROOT, manifests, printedDocument, mutantTotals, mutationEvidence, finalCapture } = require('./evidence-check.cjs');

const FRESH_COPY = fs.existsSync(path.join(ROOT, 'tests', 'scratch', 'FRESH-COPY'));
const readme = () => fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const summaryOf = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).summary;
const byName = (name) => manifests().find((file) => path.basename(file, '.json') === name);
const seconds = (ms) => (ms / 1000).toFixed(1);

// The figures of the stored evidence, by key. A key whose capture is not stored (the fresh-checkout runs inside a fresh tree) is absent.
function derived() {
  const out = {};
  const first = byName('red-initial');
  if (first) out['red.initial'] = `${summaryOf(first).fail} of ${summaryOf(first).tests}`;
  const red = byName('red-fix3-f1f2');
  if (red) out['red.f1f2'] = `${summaryOf(red).fail} of ${summaryOf(red).tests}`;
  const suite = finalCapture('green-suite');
  if (suite) {
    const document = printedDocument(suite);
    out['suite.tests'] = `${document.totals.pass} of ${document.totals.tests}`;
    out['suite.files'] = String(document.files.length);
    out['suite.slowest'] = seconds(Math.max(...document.files.map((row) => row.durationMs)));
    out['suite.cap'] = String(document.capMs / 1000);
  }
  const loop = finalCapture('loop-load');
  if (loop) {
    const report = printedDocument(loop);
    const rows = report.results.flatMap((entry) => entry.rows);
    out['loop.passed'] = `${rows.filter((row) => row.ok && row.pass === row.tests).length} of ${rows.length}`;
    out['loop.runs'] = String(report.runs);
    out['loop.parallel'] = String(report.parallel);
    out['loop.burners'] = String(report.burners.count);
    out['loop.slowest'] = seconds(Math.max(...rows.map((row) => row.durationMs)));
  }
  const coverage = finalCapture('coverage-focused');
  if (coverage) for (const result of printedDocument(coverage).results) out[`coverage.${result.file}`] = `${result.row.lines}/${result.row.branches}/${result.row.functions}`;
  const totals = mutantTotals(mutationEvidence());
  out['mutants.generated'] = String(totals.generated);
  out['mutants.killed'] = String(totals.killed);
  out['mutants.crash'] = String(totals.crash);
  out['mutants.equivalent'] = String(totals.equivalent);
  const named = fs.readdirSync(path.join(ROOT, 'evidence', 'mutants')).filter((name) => /^named-mutants-\d+\.json$/.test(name)).sort().pop();
  if (named) {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence', 'mutants', named), 'utf8'));
    out['named.total'] = String(report.total);
    out['named.killed'] = String(report.killed);
  }
  for (const [kind, stem] of [['lf', 'fresh-lf'], ['crlf', 'fresh-crlf']]) {
    const file = finalCapture(stem);
    if (file) out[`fresh.${kind}`] = `${summaryOf(file).pass} of ${summaryOf(file).tests}`;
  }
  const edge = finalCapture('browser-run');
  if (edge) {
    const manifest = JSON.parse(fs.readFileSync(edge, 'utf8'));
    const stdout = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(edge), manifest.transcripts.stdout.path.replace(/\\/g, '/')))).toString('utf8');
    const version = /"version":"([\d.]+)"/.exec(stdout);
    if (version) out['edge.version'] = version[1];
  }
  return out;
}

// A figure with its marker: `N of M`, a triple `a/b/c`, a version or a number, then up to three words (its unit) and the marker `<!--f:key-->`. An UNTAGGED figure is `N of M`, a triple, a
// version, or a number that is followed by a unit word (tests, files, runs, mutants, seconds ...).
const NUMBER = '\\d[\\d,]*(?:\\.\\d+)?';
const TRIPLE = '\\d+(?:\\.\\d+)?/\\d+(?:\\.\\d+)?/\\d+(?:\\.\\d+)?';
const VERSION = '\\d+\\.\\d+\\.\\d+\\.\\d+';
const UNITS = '(?:mutants?|killed|equivalent|survivors?|survived|undecided|tests?|runs?|test files?|files|burners|s)';
const TAGGED = new RegExp(`(${NUMBER} of ${NUMBER}|${TRIPLE}|${VERSION}|${NUMBER})(?: [A-Za-z][A-Za-z-]*){0,3}<!--f:([\\w.-]+)-->`, 'g');
const UNTAGGED = new RegExp(`${NUMBER} of ${NUMBER}|${TRIPLE}|${VERSION}|${NUMBER}(?= ${UNITS}\\b)`, 'g');
const DESIGN = new Set(['85/85/85', '127.0.0.1']); // the coverage threshold is a requirement, not a result; the loopback address is no figure

// The paragraphs of the README outside the fenced blocks and the claims table: a bullet, a numbered item, a table row and a heading each start one, a blank line ends one.
function paragraphs(text) {
  const out = [];
  let current = null;
  let fenced = false;
  let table = false;
  text.split('\n').forEach((line, index) => {
    if (/^```/.test(line)) { fenced = !fenced; current = null; return; }
    if (fenced) return;
    if (line.includes('<!-- claims:begin -->')) { table = true; current = null; return; }
    if (line.includes('<!-- claims:end -->')) { table = false; return; }
    if (table) return;
    if (/^\s*$/.test(line)) { current = null; return; }
    if (/^(?:\* |\d+\. |\| |#)/.test(line) || current === null) { current = { line: index + 1, text: line }; out.push(current); } else current.text += ` ${line.trim()}`;
  });
  return out.filter((paragraph) => !paragraph.text.startsWith('#'));
}

function checkProse(text, figures) {
  const problems = [];
  for (const { line, text: body } of paragraphs(text)) {
    let rest = body;
    let tagged = 0;
    for (const match of body.matchAll(TAGGED)) {
      tagged += 1;
      const [phrase, value, key] = match;
      rest = rest.replace(phrase, ' '.repeat(phrase.length));
      if (!Object.hasOwn(figures, key)) problems.push(`line ${line}: the marker "${key}" names no stored figure (${phrase})`);
      else if (figures[key] !== value.replace(/,/g, '')) problems.push(`line ${line}: "${value}" is stated for ${key}, the evidence has "${figures[key]}"`);
    }
    for (const match of rest.matchAll(UNTAGGED)) if (!DESIGN.has(match[0])) problems.push(`line ${line}: the figure "${match[0]}" has no <!--f:key--> marker (${body.slice(0, 70)}...)`);
    if ((body.match(/<!--f:/g) || []).length !== tagged) problems.push(`line ${line}: a marker does not follow a figure (${body.slice(0, 70)}...)`);
  }
  return problems;
}

const STRONG = /\b(?:pinned|every|whole|never|always)\b/i;
function claimRows(text) {
  const block = /<!-- claims:begin -->([^]*?)<!-- claims:end -->/.exec(text);
  assert.ok(block, 'the README has a claims table');
  return block[1].split('\n').filter((line) => /^\| C\d\d \|/.test(line)).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

function checkCitations(text, ids) {
  const problems = [];
  for (const { line, text: body } of paragraphs(text)) {
    const cited = [...body.matchAll(/\[(C\d\d)\]/g)].map((match) => match[1]);
    if (STRONG.test(body) && cited.length === 0) problems.push(`line ${line}: says "${STRONG.exec(body)[0]}" and cites no claim (${body.slice(0, 80)}...)`);
    for (const id of cited) if (!ids.has(id)) problems.push(`line ${line}: cites ${id}, which is not a row of the claims table`);
  }
  return problems;
}

test('the figures of the README prose are the figures of the stored evidence: each carries a marker, and the value behind the marker is the one derived from the evidence', () => {
  const figures = derived();
  assert.deepEqual(checkProse(readme(), figures), []);
  const tagged = paragraphs(readme()).reduce((sum, paragraph) => sum + [...paragraph.text.matchAll(TAGGED)].length, 0);
  assert.ok(tagged >= 18, `${tagged} figures carry a marker`);
});

test('a drifting figure is caught BY NAME: a changed number, a removed marker, an unknown key, a new untagged figure, a changed coverage triple, a marker behind no figure', () => {
  const figures = { 'a.b': '120 of 120', 'c.d': '30.6', 'e.f': '100/97.87/100', 'g.h': '14', 'i.j': '4' };
  const good = 'All 120 of 120<!--f:a.b--> runs passed, the slowest took 30.6 s<!--f:c.d-->, coverage 100/97.87/100<!--f:e.f-->, 14 equivalent<!--f:g.h-->, 4 at a time<!--f:i.j-->.';
  assert.deepEqual(checkProse(good, figures), []);
  const cases = {
    'a changed number': [good.replace('120 of 120', '119 of 120'), /"119 of 120" is stated for a\.b, the evidence has "120 of 120"/],
    'a changed number of seconds': [good.replace('30.6 s', '29.6 s'), /"29\.6" is stated for c\.d/],
    'a removed marker': [good.replace('<!--f:c.d-->', ''), /the figure "30\.6" has no <!--f:key--> marker/],
    'an unknown key': [good.replace('f:g.h', 'f:g.x'), /names no stored figure/],
    'a new untagged figure': [`${good} Also 581 killed.`, /the figure "581" has no <!--f:key--> marker/],
    'a changed coverage triple': [good.replace('100/97.87/100', '100/100/100'), /stated for e\.f/],
    'an untagged N of M': [`${good} Then 5 of 5 failed.`, /the figure "5 of 5" has no/],
    'a marker behind no figure': [`${good} Words only<!--f:a.b-->.`, /a marker does not follow a figure/]
  };
  for (const [name, [text, expected]] of Object.entries(cases)) assert.ok(checkProse(text, figures).some((problem) => expected.test(problem)), `${name}: ${JSON.stringify(checkProse(text, figures))}`);
  assert.deepEqual(checkProse('```\n120 runs and 85/85/85\n```\nThe threshold is 85/85/85.\n\n<!-- claims:begin -->\n| C01 | 20 runs | a.test.cjs | something |\n<!-- claims:end -->', figures), [], 'a fenced block and the claims table are no prose, the threshold is a requirement');
});

test('every claim of the README claims table is backed by a test that exists: the named file holds a test whose title starts with the stated words', () => {
  const rows = claimRows(readme());
  assert.ok(rows.length >= 90, `${rows.length} claims are listed`);
  assert.equal(new Set(rows.map(([id]) => id)).size, rows.length, 'the ids are unique');
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [id, claim, file, start] of rows) {
    assert.ok(claim.length > 20 && /^[\w.-]+\.test\.cjs$/.test(file) && start.length >= 12, `${id}: a well formed row`);
    const source = fs.readFileSync(path.join(ROOT, 'tests', file), 'utf8');
    assert.match(source, new RegExp(`test\\((['"\`])${escape(start)}`), `${id}: ${file} holds a test that starts with "${start}"`);
  }
});

test('every README paragraph that says pinned, every, whole, never or always cites a claim of the claims table, and every citation names a row that exists', () => {
  const ids = new Set(claimRows(readme()).map(([id]) => id));
  assert.deepEqual(checkCitations(readme(), ids), []);
  const cited = new Set([...readme().matchAll(/\[(C\d\d)\]/g)].map((match) => match[1]));
  assert.ok(cited.size >= 60, `${cited.size} rows are cited`);
});

test('a README paragraph without its citation, a citation of a row that does not exist, and a citation behind a heading or a fence are told apart BY NAME', () => {
  const ids = new Set(['C01', 'C02']);
  assert.deepEqual(checkCitations('Every canary is found [C01].\n\n* never shown [C02] and [C01]\n\n## Every heading is no claim', ids), []);
  assert.ok(checkCitations('Every canary is found.', ids).some((problem) => /line 1: says "Every" and cites no claim/.test(problem)));
  assert.ok(checkCitations('* A first bullet is fine [C01].\n* A second one says whole and nothing else.', ids).some((problem) => /line 2: says "whole"/.test(problem)));
  assert.ok(checkCitations('Nothing strong here [C03].', ids).some((problem) => /line 1: cites C03, which is not a row of the claims table/.test(problem)));
  assert.ok(checkCitations('A table of rows:\n| a | never |\n| b | c |', ids).some((problem) => /line 2: says "never"/.test(problem)), 'a table row is a paragraph of its own');
  assert.deepEqual(checkCitations('```\nevery fenced line\n```\n<!-- claims:begin -->\n| C01 | every row | a.test.cjs | x |\n<!-- claims:end -->', ids), [], 'a fenced block and the claims table are no prose');
});

test('the fresh-checkout lines of the README state the figures of the stored fresh-checkout captures (a fresh tree is a copy made before them: it has no such lines)', () => {
  if (FRESH_COPY) return;
  for (const [name, stem] of [['LF', 'fresh-lf'], ['CRLF', 'fresh-crlf']]) {
    const file = finalCapture(stem);
    assert.ok(file, `the ${name} capture is stored`);
    const summary = summaryOf(file);
    assert.deepEqual([summary.fail, summary.cancelled, summary.skipped, summary.pass === summary.tests], [0, 0, 0, true], `${name}: nothing failed, was cancelled or skipped`);
    assert.match(readme(), new RegExp(`FRESH-CHECKOUT-${name}: ${summary.pass} of ${summary.tests}<!--f:fresh\\.${name.toLowerCase()}--> tests passed \\(exit 0\\)`), `the README states the ${name} figures`);
  }
});
