'use strict';

// Test tooling, not production code: renders the FIGURES block of the README from the latest archived manifests, so that a figure can never drift from the evidence (the
// integrity test compares the block of the README with this output byte for byte). The GREEN run cannot be in the block (it runs the test that checks the block); its counts are
// in its own manifest and in the result file. Usage: node tests\figures.cjs (prints the block).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const raw = path.join(root, 'evidence', 'raw');
const red = path.join(root, 'evidence', 'red');
const BEGIN = '<!-- figures:begin -->';
const END = '<!-- figures:end -->';
const FIX3_REDS = [['run-13', 'M2: the pins accept either form'], ['run-14', 'Q3 and Q7: frozen tables, `expected` required'], ['run-15', 'Q1: the refused request itself (mutant S1)'], ['run-16', 'Q2: the connection cap']];

const numbers = (directory, pattern) => fs.readdirSync(directory).map((name) => pattern.exec(name)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
const latest = (stage) => numbers(raw, new RegExp(`^${stage}-(\\d+)\\.json$`)).at(-1);
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
  rows.push(['Per-file coverage, lines / branches / functions (one command per file)', `coverage-${coverage}`, table.map(([file, lines, branches, functions]) => `\`${file}\` ${lines} / ${branches} / ${functions}`).join('; ')]);

  const full = numbers(raw, /^mutgen-report-(\d+)\.json$/).reverse().find((number) => JSON.parse(fs.readFileSync(path.join(raw, `mutgen-report-${number}.json`), 'utf8')).total >= 150);
  if (full !== undefined) {
    const report = JSON.parse(fs.readFileSync(path.join(raw, `mutgen-report-${full}.json`), 'utf8'));
    const survivingEquivalent = report.equivalent.filter((item) => item.survived).length;
    rows.push(['Systematic mutation, the latest FULL run', `mutgen-${full}`, `${report.total} mutants: ${report.killed} killed by a named failing test, ${survivingEquivalent} equivalent survivors (each with its proof), ${report.survivors.length} other survivors, ${report.errors} errors`]);
  }

  const loop = latest('loop');
  if (loop !== undefined) {
    const text = stdoutOf(path.join(raw, `loop-${loop}.json`));
    const summary = JSON.parse(text.slice(text.indexOf('{')));
    const seconds = summary.results.map((item) => item.seconds).sort((a, b) => a - b);
    rows.push(['Load loop of the flood test', `loop-${loop}`, `${summary.runs} runs, ${summary.parallel} at a time, ${summary.burners} CPU burners: ${summary.passed} passed; seconds per run (min / median / max): ${seconds[0]} / ${seconds[seconds.length >> 1]} / ${seconds.at(-1)}`]);
  }

  const browser = latest('browser');
  rows.push(['Real isolated headless Edge', `browser-${browser}`, `${[...stdoutOf(path.join(raw, `browser-${browser}.json`)).matchAll(/^PASS /gm)].length} PASS`]);

  for (const [run, what] of FIX3_REDS) {
    const manifestPath = path.join(red, run, 'red.json');
    if (!fs.existsSync(manifestPath)) continue;
    const { summary } = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    rows.push([`RED of this fix: ${what}`, `evidence\\red\\${run}`, `${summary.tests} tests, ${summary.fail} fail against the old subject, ${summary.pass} pass`]);
  }
  return [BEGIN, '| Stage | Archive | Figures |', '| --- | --- | --- |', ...rows.map(([stage, archive, figures]) => `| ${stage} | \`${archive}\` | ${figures} |`), END].join('\n');
}

const between = (text) => {
  const from = text.indexOf(BEGIN);
  const to = text.indexOf(END);
  return from < 0 || to < from ? null : text.slice(from, to + END.length).replace(/\r\n/g, '\n');
};

if (require.main === module) process.stdout.write(`${render()}\n`);
module.exports = Object.freeze({ BEGIN, END, FIX3_REDS, between, render });
