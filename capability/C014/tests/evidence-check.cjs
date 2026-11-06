'use strict';

// Test tooling, not production code: recomputes a capture manifest written by the shared recorder (RUN\scripts\archive-run.cjs) against the files it names:
// both gzip transcripts (their hashes and their sizes), every input (the CRLF-to-LF SHA-256 must still be the one recorded at capture time) and the exit code.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const normal = (value) => value.replace(/\\/g, '/');

function checkManifest(file, { repository = REPOSITORY, allowExit = false, skipInputs = false } = {}) {
  const problems = [];
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return [`${path.basename(file)}: not readable JSON`]; }
  const name = path.basename(file);
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts && manifest.transcripts[stream];
    if (!entry) { problems.push(`${name}: no ${stream} transcript recorded`); continue; }
    const gzipPath = path.join(path.dirname(file), normal(entry.path));
    if (!fs.existsSync(gzipPath)) { problems.push(`${name}: ${stream} transcript is missing`); continue; }
    const gzip = fs.readFileSync(gzipPath);
    if (sha(gzip) !== entry.gzipSha256) { problems.push(`${name}: ${stream} transcript changed (gzip hash)`); continue; }
    let raw;
    try { raw = zlib.gunzipSync(gzip); } catch { problems.push(`${name}: ${stream} transcript is not gzip`); continue; }
    if (sha(raw) !== entry.sha256 || raw.length !== entry.bytes) problems.push(`${name}: ${stream} transcript changed (content hash or size)`);
  }
  for (const input of allowExit || skipInputs ? [] : manifest.inputs || []) {
    const inputPath = path.join(repository, normal(input.path));
    if (!fs.existsSync(inputPath)) problems.push(`${name}: input ${input.path} is missing`);
    else if (sha(lf(fs.readFileSync(inputPath))) !== input.crlfToLfSha256) problems.push(`${name}: input ${input.path} changed after the capture`);
  }
  if (!allowExit && (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut)) problems.push(`${name}: exit code ${manifest.exitCode} is not the expected ${manifest.expectedExitCode}`);
  return problems;
}

// Every capture manifest of the namespace evidence (a JSON with transcripts, outside the raw folders).
function manifests(root = path.join(ROOT, 'evidence')) {
  const found = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'raw') walk(full); } else if (entry.name.endsWith('.json')) {
        try { if (JSON.parse(fs.readFileSync(full, 'utf8')).transcripts) found.push(full); } catch { /* not a capture manifest */ }
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return found.sort();
}

// The JSON document a capture printed on stdout (the coverage gate prints one document; the load loop prints one between its progress lines and its TAP summary).
function printedDocument(manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const text = zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(manifestFile), normal(manifest.transcripts.stdout.path)))).toString('utf8').replace(/\r\n/g, '\n');
  const first = text.search(/^\{$/m);
  const last = text.lastIndexOf('\n}\n');
  return JSON.parse(text.slice(first, last + 2));
}

// The systematic mutation evidence: every mutant the generator lists for the CURRENT production bytes was run (by a report, or by a re-run of a survivor after a new
// test was added), every one was decided (killed by a named failing test, or by a load-time crash, counted apart), none is undecided, and every survivor is listed as
// equivalent with a written reason that names the very mutant. A report entry made for EARLIER bytes of a file (the file was edited later and its campaign was run again)
// is history: it is ignored, and the file must have a main report entry for its current bytes. Returns the list of problems.
function checkMutants({ reports, reruns, equivalents, root = ROOT }) {
  const { generate, SUITES } = require('./mutants.cjs');
  const problems = [];
  for (const file of Object.keys(SUITES)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const generated = generate(source);
    const hash = sha(Buffer.from(source.replace(/\r\n/g, '\n')));
    const decided = new Map();
    let mainReport = false;
    for (const report of [...reports, ...reruns]) {
      const entry = report.files && report.files[file];
      if (!entry || entry.sourceLfSha256 !== hash) continue;
      if (reports.includes(report)) mainReport = true;
      if (entry.generated !== generated.length) problems.push(`${file}: a report lists ${entry.generated} mutants, the generator lists ${generated.length}`);
      if (reports.includes(report) && !(entry.control && entry.control.exit === 0 && entry.control.ranTests > 0 && entry.control.passed === entry.control.ranTests)) problems.push(`${file}: no green control run (the suites unmutated) in the main report`);
      for (const result of entry.results) {
        const mutant = generated[result.index];
        if (!mutant || mutant.kind !== result.kind || mutant.original.slice(0, 60) !== result.original || mutant.replacement.slice(0, 40) !== result.replacement) problems.push(`${file} #${result.index}: not the mutant the generator lists`);
        if (result.killed && !result.crash && result.failing.length === 0) problems.push(`${file} #${result.index}: killed without a named failing test`);
        decided.set(result.index, result);
      }
    }
    if (!mainReport) problems.push(`${file}: no campaign report was made for the current source bytes`);
    for (let index = 0; index < generated.length; index += 1) {
      const result = decided.get(index);
      if (!result) { problems.push(`${file} #${index}: never run`); continue; }
      if (result.killed) continue;
      if (result.timedOut) { problems.push(`${file} #${index}: undecided (it only timed out)`); continue; }
      const equivalent = equivalents.find((item) => item.file === file && item.index === index);
      if (!equivalent) problems.push(`${file} #${index} (${generated[index].kind}): survived and is not listed as equivalent`);
      else if (typeof equivalent.reason !== 'string' || equivalent.reason.length < 60) problems.push(`${file} #${index}: the equivalence has no written reason`);
      else if (equivalent.kind !== generated[index].kind || equivalent.original !== generated[index].original.slice(0, 60) || equivalent.replacement !== generated[index].replacement.slice(0, 40)) problems.push(`${file} #${index}: the equivalence names another mutant`);
    }
  }
  for (const item of equivalents) if (!Number.isInteger(item.index) || !Object.hasOwn(require('./mutants.cjs').SUITES, item.file)) problems.push(`an equivalence names no mutant: ${JSON.stringify(item).slice(0, 80)}`);
  return problems;
}

// The figures of the campaign, from the final decision of every mutant (a re-run of a survivor overrides the first report): killed by a named failing test, killed by a
// load-time crash, listed as equivalent. Together with checkMutants() returning no problem, killed + crash + equivalent equals generated.
function mutantTotals({ reports, reruns, equivalents, root = ROOT }) {
  const { SUITES } = require('./mutants.cjs');
  const totals = { generated: 0, killed: 0, crash: 0, equivalent: equivalents.length, perFile: {} };
  for (const file of Object.keys(SUITES)) {
    const hash = sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
    const decided = new Map();
    let generated = 0;
    for (const report of [...reports, ...reruns]) {
      const entry = report.files && report.files[file];
      if (!entry || entry.sourceLfSha256 !== hash) continue;
      generated = entry.generated;
      for (const result of entry.results) decided.set(result.index, result);
    }
    const own = [...decided.values()];
    totals.generated += generated;
    totals.killed += own.filter((result) => result.killed && !result.crash).length;
    totals.crash += own.filter((result) => result.killed && result.crash).length;
    totals.perFile[file] = { generated, killed: own.filter((result) => result.killed && !result.crash).length, crash: own.filter((result) => result.killed && result.crash).length, equivalent: equivalents.filter((item) => item.file === file).length };
  }
  return totals;
}

module.exports = Object.freeze({ ROOT, REPOSITORY, sha, lf, checkManifest, manifests, printedDocument, checkMutants, mutantTotals });
