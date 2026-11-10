'use strict';

// Historical figures only: the retained third/fourth-fix captures are immutable.
// Current continuation figures are derived by final-evidence.cjs, after source
// freeze, so recording a new measurement never requires editing the README.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { TABLE } = require('./refusal-table.cjs');
const root = path.resolve(__dirname, '..');
const raw = path.join(root, 'evidence', 'raw');
const red = path.join(root, 'evidence', 'red');
const BEGIN = '<!-- figures:begin -->';
const END = '<!-- figures:end -->';
const FIX3_REDS = [['run-13', 'M2: the pins accept either form'], ['run-14', 'Q3 and Q7: frozen tables, `expected` required'], ['run-15', 'Q1: the refused request itself (mutant S1)'], ['run-16', 'Q2: the connection cap']];
const FIX4_REDS = [['run-17', 'D1: a request queued behind a parse error never runs (mutant: decide() deleted from refuseMalformed)']];

const numbers = (directory, pattern) => fs.readdirSync(directory).map((name) => pattern.exec(name)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
const HISTORICAL = Object.freeze({ coverage: 9, loop: 4, browser: 13 });
const latest = (stage) => HISTORICAL[stage] ?? numbers(raw, new RegExp(`^${stage}-(\\d+)\\.json$`)).at(-1);
const stdoutOf = (file) => {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = manifest.transcripts.stdout;
  return zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(file), ...entry.path.split('\\')))).toString('utf8').replace(/\r\n/g, '\n');
};

function render() {
  const rows = [];
  const coverage = latest('coverage');
  const table = [...stdoutOf(path.join(raw, `coverage-${coverage}.json`)).matchAll(/"file": "([^"]+)",\s+"lines": ([\d.]+),\s+"branches": ([\d.]+),\s+"functions": ([\d.]+)/g)]
    .map((match) => [path.basename(match[1]), match[2], match[3], match[4]]).sort((a, b) => a[0].localeCompare(b[0]));
  rows.push(['Historical per-file coverage, lines / branches / functions; not a new continuation observation', `coverage-${coverage}`, table.map(([file, lines, branches, functions]) => `\`${file}\` ${lines} / ${branches} / ${functions}`).join('; ')]);

  const full = 9;
  if (full !== undefined) {
    const report = JSON.parse(fs.readFileSync(path.join(raw, `mutgen-report-${full}.json`), 'utf8'));
    const survived = report.equivalent.filter((item) => item.survived);
    if (report.schema === 'C059-mutation-gen/2') {
      const kinds = (kind) => survived.filter((item) => item.proof === kind).length;
      rows.push(['Systematic mutation, the latest FULL run (a kill is a named test that failed by an assertion or a thrown error)', `mutgen-${full}`, `${report.total} mutants: ${report.killed} killed, ${survived.length} equivalent survivors (${kinds('identity')} identity, ${kinds('demonstrated')} with a runnable demonstration, ${kinds('reasoning')} reasoning only), ${report.survivors.length} other survivors, ${report.undecided} undecided, ${report.errors} errors, ${report.treeRepairs} tree paths repaired`]);
    } else {
      rows.push(['Historical schema-1 mutation accounting, rejected and superseded; NOT current causal kills or proven equivalence', `mutgen-${full}`, `${report.total} mutants: ${report.killed} reported killed, ${survived.length} reported equivalent, ${report.survivors.length} other reported survivors, ${report.errors} errors; D1 and D2 invalidate those classifications`]);
    }
  }

  const statuses = new Map();
  for (const [, , status] of TABLE) statuses.set(status, (statuses.get(status) ?? 0) + 1);
  rows.push(['Refusal table of tests\\server.test.cjs (read from tests\\refusal-table.cjs)', 'tests\\refusal-table.cjs', `${TABLE.length} rows: ${[...statuses].sort((a, b) => a[0] - b[0]).map(([status, count]) => (count > 1 ? `${status} x${count}` : `${status}`)).join(', ')}`]);

  const loop = latest('loop');
  if (loop !== undefined) {
    const text = stdoutOf(path.join(raw, `loop-${loop}.json`));
    const summary = JSON.parse(text.slice(text.indexOf('{')));
    const seconds = summary.results.map((item) => item.seconds).sort((a, b) => a - b);
    rows.push(['Historical load loop, not a new continuation observation', `loop-${loop}`, `${summary.runs} runs, ${summary.parallel} at a time, ${summary.burners} CPU burners: ${summary.passed} passed; seconds per run (min / median / max): ${seconds[0]} / ${seconds[seconds.length >> 1]} / ${seconds.at(-1)}`]);
  }

  const browser = latest('browser');
  rows.push(['Historical isolated Edge, not current installed-runtime acceptance', `browser-${browser}`, `${[...stdoutOf(path.join(raw, `browser-${browser}.json`)).matchAll(/^PASS /gm)].length} PASS`]);

  for (const [fix, list] of [['the third fix', FIX3_REDS], ['this fix', FIX4_REDS]]) {
    for (const [run, what] of list) {
      const manifestPath = path.join(red, run, 'red.json');
      if (!fs.existsSync(manifestPath)) continue;
      const { summary } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      rows.push([`Retained RED of ${fix}: ${what}`, `evidence\\red\\${run}`, `${summary.tests} tests, ${summary.fail} fail against the old subject, ${summary.pass} pass`]);
    }
  }
  return [BEGIN, '| Stage | Archive | Figures |', '| --- | --- | --- |', ...rows.map(([stage, archive, figures]) => `| ${stage} | \`${archive}\` | ${figures} |`), END].join('\n');
}

const between = (text) => {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  return from < 0 || to < from ? null : text.slice(from, to + END.length).replace(/\r\n/g, '\n');
};

if (require.main === module) process.stdout.write(`${render()}\n`);
module.exports = Object.freeze({ BEGIN, END, FIX3_REDS, FIX4_REDS, between, render });
