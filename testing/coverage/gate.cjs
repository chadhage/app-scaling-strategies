'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('./errors.cjs');
const { walkTree, loadManifest, enumerate, resolveTests } = require('./enumerate.cjs');
const { buildEnvironment, buildCommand } = require('./command.cjs');
const { parseLcov, selectRecord, parseTapSummary, parseTapFailures, parseTapTable, tableRowFor } = require('./report.cjs');
const { evaluateFile, unrunFile, buildReport, formatSummary } = require('./evaluate.cjs');
const { runProcess } = require('./runner.cjs');
const { checkReportTarget, writeReportFile, startedReport, notRunReport, failureReport, scanJsonTargets } = require('./output.cjs');

const REPOSITORY = path.resolve(__dirname, '..', '..');
const SCALAR_FLAGS = Object.freeze({
  '--root': 'root', '--json': 'json', '--min': 'min', '--timeout': 'timeout', '--jobs': 'jobs', '--scratch': 'scratch', '--manifest': 'manifest'
});
const LIST_FLAGS = Object.freeze({ '--tests': 'tests', '--include': 'include', '--exclude': 'exclude' });

const USAGE = [
  'Usage: node testing\\coverage\\gate.cjs --root <dir> [--tests <files...>] [--min 85] [--json <out>] [--include <glob...>] [--exclude <glob...>]',
  '                                         [--timeout <seconds>] [--jobs <n>] [--scratch <dir>] [--manifest <file>]',
  '',
  '  --root     namespace directory to measure (required); its coverage.manifest.json, when present, classifies files explicitly',
  '  --tests    focused test files or globs, relative to the current directory (default: the non-browser tests\\*.test.cjs of the root)',
  '  --min      minimum percent for lines, branches and functions of every file, an integer from 0 to 100 (default 85)',
  '  --json     also write the JSON report to this path (--json <out> or --json=<out>): a new file or a previous gate report only (anything else is',
  '             refused, exit 2). A "started" marker is written first and a failure or not-run report on every error and for --help, so an older result',
  '             does not survive at that path; a file the gate can neither replace nor remove keeps its bytes (the exit code and stdout still say so)',
  '  --include  measure only the production files that match these globs (relative to the root; * ** ?)',
  '  --exclude  leave out files that match these globs; the report records every exclusion',
  '  --timeout  hard limit in seconds for one per-file run (default 900); the child process tree is ended',
  '  --jobs     per-file runs in parallel (default 1)',
  '  --scratch  folder for the per-run scratch directories (default testing\\coverage\\.scratch)',
  '  --manifest classify with this manifest file instead of <root>\\coverage.manifest.json (a namespace that cannot take a new file)',
  '',
  'stdout is one JSON document; a readable summary goes to stderr. Exit codes: 0 pass, 1 any miss or internal error, 2 usage error.'
].join('\n');

function integerFlag(value, flag, low, high) {
  if (!/^\d+$/.test(value) || Number(value) < low || Number(value) > high) {
    throw new UsageError(`${flag} must be an integer from ${low} to ${high}, got "${value}".`);
  }
  return Number(value);
}

function parseArgs(argv) {
  const options = { root: null, tests: [], min: 85, json: null, include: [], exclude: [], timeout: 900, jobs: 1, scratch: null, manifest: null, help: false };
  const raw = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') {
      options.help = true;
    } else if (SCALAR_FLAGS[flag] || LIST_FLAGS[flag]) {
      const values = [];
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
        values.push(argv[index + 1]);
        index += 1;
      }
      if (values.length === 0) throw new UsageError(`${flag} needs a value.`);
      if (SCALAR_FLAGS[flag]) {
        if (values.length !== 1) throw new UsageError(`${flag} takes exactly one value.`);
        if (raw[SCALAR_FLAGS[flag]] !== undefined) throw new UsageError(`${flag} was given more than once: say which value you mean.`);
        raw[SCALAR_FLAGS[flag]] = values[0];
      } else {
        options[LIST_FLAGS[flag]].push(...values);
      }
    } else {
      throw new UsageError(`Unknown argument "${flag}".`);
    }
  }
  if (options.help) return options;
  if (raw.root === undefined) throw new UsageError('--root <dir> is required.');
  options.root = raw.root;
  options.json = raw.json ?? null;
  options.scratch = raw.scratch ?? null;
  options.manifest = raw.manifest ?? null;
  if (raw.min !== undefined) options.min = integerFlag(raw.min, '--min', 0, 100);
  if (raw.jobs !== undefined) options.jobs = integerFlag(raw.jobs, '--jobs', 1, 16);
  if (raw.timeout !== undefined) {
    options.timeout = Number(raw.timeout);
    if (!Number.isFinite(options.timeout) || options.timeout <= 0 || options.timeout > 86400) {
      throw new UsageError(`--timeout must be a number of seconds above 0 and at most 86400, got "${raw.timeout}".`);
    }
  }
  return options;
}

// Repo-relative with / separators when the target lies inside the repository, otherwise the absolute path.
function displayPath(repository, target) {
  const relative = path.relative(repository, target);
  const outside = relative === '' || path.isAbsolute(relative) || relative.split(path.sep)[0] === '..';
  return (outside ? target : relative).replace(/\\/g, '/');
}

async function mapPool(items, jobs, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, lane));
  return results;
}

function removeScratch(directory, fsApi, warnings) {
  try {
    fsApi.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    warnings.push(`could not remove the scratch directory ${directory}: ${error.message}`);
  }
}

// Another run may remove an empty parent between the two calls, so a missing parent is created again (at most twice).
function makeRunDirectory(fsApi, parent) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      fsApi.mkdirSync(parent, { recursive: true });
      return fsApi.mkdtempSync(path.join(parent, 'u009-'));
    } catch (error) {
      if (error.code !== 'ENOENT' || attempt >= 3) throw error;
    }
  }
}

// The folders of `directory` that do not exist yet, deepest first: this run creates them and removes them again when nothing else uses them.
function missingFolders(directory, fsApi) {
  const missing = [];
  for (let current = directory; !fsApi.existsSync(current); current = path.dirname(current)) {
    missing.push(current);
    if (path.dirname(current) === current) break;
  }
  return missing;
}

// rmdir refuses a folder that holds anything, so a folder another run or a person put something into stays.
function removeCreatedFolders(folders, fsApi) {
  for (const folder of folders) {
    try {
      fsApi.rmdirSync(folder);
    } catch {
      return;
    }
  }
}

// Node writes no lcov record for an empty file, so "no record" for a zero-byte file gets its own reason.
function isEmptyFile(file, fsApi) {
  try {
    return fsApi.statSync(file).size === 0;
  } catch {
    return false;
  }
}

async function runGate(options, deps) {
  const { fsApi, cwd, repoRoot } = deps;
  const reportTarget = options.json === null ? null : path.resolve(cwd, options.json);
  let marker = null;
  if (reportTarget !== null) {
    checkReportTarget(reportTarget, { fsApi });
    marker = writeReportFile(reportTarget, startedReport(), { fsApi });
  }
  const root = path.resolve(cwd, options.root);
  if (!fsApi.existsSync(root) || !fsApi.statSync(root).isDirectory()) throw new UsageError(`--root is not a directory: ${options.root}`);
  const filters = { include: options.include, exclude: options.exclude };
  const manifestFile = options.manifest === null ? undefined : path.resolve(cwd, options.manifest);
  if (manifestFile !== undefined && !fsApi.existsSync(manifestFile)) throw new UsageError(`--manifest file not found: ${options.manifest}`);
  const enumeration = enumerate(walkTree(root, fsApi), loadManifest(root, fsApi, manifestFile), filters);
  const { tests, problems } = resolveTests({ patterns: options.tests, cwd, root, fsApi });
  const timeoutMs = Math.round(options.timeout * 1000);
  const warnings = [...enumeration.warnings];
  const scratchParent = path.resolve(cwd, options.scratch ?? deps.defaultScratch);
  const createdFolders = missingFolders(scratchParent, fsApi);
  const scratch = makeRunDirectory(fsApi, scratchParent);
  let files;
  try {
    files = await mapPool(enumeration.production, options.jobs, async (entry, index) => {
      if (problems.length > 0) return unrunFile({ file: entry.file, reasons: problems });
      const file = path.join(root, ...entry.file.split('/'));
      const lcov = path.join(scratch, `${index}.lcov`);
      let command;
      try {
        command = buildCommand({ cwd: repoRoot, file, tests, min: options.min, lcov });
      } catch (error) {
        if (error instanceof UsageError) return unrunFile({ file: entry.file, reasons: [error.message] });
        throw error;
      }
      deps.progress?.(`measuring ${entry.file} (${index + 1} of ${enumeration.production.length})`);
      const temp = path.join(scratch, `t${index}`);
      fsApi.mkdirSync(temp, { recursive: true });
      const run = await deps.run({
        command: deps.nodeExecutable, args: command.args, cwd: repoRoot, timeoutMs,
        env: buildEnvironment(deps.env, { TEMP: temp, TMP: temp, TMPDIR: temp })
      });
      let record;
      let lcovError = null;
      try {
        record = selectRecord(parseLcov(fsApi.readFileSync(lcov, 'utf8')), repoRoot, file);
      } catch (error) {
        lcovError = error.code === 'ENOENT' ? 'no lcov file was written' : error.message;
      }
      return evaluateFile({
        file: entry.file, min: options.min, command: command.canonical, timeoutMs, run, summary: parseTapSummary(run.stdout),
        failedTests: parseTapFailures(run.stdout), record, table: tableRowFor(parseTapTable(run.stdout), file), lcovError,
        empty: record === undefined && isEmptyFile(file, fsApi)
      });
    });
  } finally {
    removeScratch(scratch, fsApi, warnings);
    removeCreatedFolders(createdFolders, fsApi);
  }
  const report = buildReport({
    root: displayPath(repoRoot, root), node: deps.nodeVersion, min: options.min, files, unclassified: enumeration.unclassified,
    excluded: enumeration.excluded, skippedDirectories: enumeration.skippedDirectories, warnings, notConsidered: enumeration.notConsidered,
    tests: problems.length > 0 ? [] : tests.map((test) => displayPath(repoRoot, test)), filters, timeoutMs
  });
  if (reportTarget !== null) writeReportFile(reportTarget, report, { fsApi, expected: marker });
  return { report, exitCode: report.pass ? 0 : 1 };
}

// Puts `document` at every --json path of the command line (both spellings) that is a new file or a previous gate report: a path that is refused or cannot
// be written keeps what it has, and the reason is in the report on stdout.
function replaceReports(argv, document, deps) {
  for (const value of scanJsonTargets(argv)) {
    try {
      const target = path.resolve(deps.cwd, value);
      checkReportTarget(target, { fsApi: deps.fsApi });
      writeReportFile(target, document, { fsApi: deps.fsApi });
    } catch {
      // a refused or unwritable path keeps what it has
    }
  }
}

// Every failure becomes a typed report on stdout, at every --json path named on the command line, and an exit code: 2 for a usage error and 1 for
// anything else, an error of the gate itself included. Nothing is rethrown, so NODE_OPTIONS=--unhandled-rejections=warn can never turn one into exit 0 (F2).
async function main(argv, io = {}) {
  const deps = {
    cwd: process.cwd(), env: process.env, repoRoot: REPOSITORY, fsApi: fs, run: runProcess, nodeExecutable: process.execPath,
    nodeVersion: process.version, defaultScratch: path.join(__dirname, '.scratch'),
    stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text), ...io
  };
  deps.progress ??= (text) => deps.stderr(`${text}\n`);
  try {
    const options = parseArgs(argv);
    if (options.help) {
      replaceReports(argv, notRunReport('--help was given: nothing was measured, so this file is not a result'), deps);
      deps.stdout(`${USAGE}\n`);
      return 0;
    }
    const { report, exitCode } = await runGate(options, deps);
    deps.stdout(`${JSON.stringify(report, null, 2)}\n`);
    for (const line of formatSummary(report)) deps.stderr(`${line}\n`);
    return exitCode;
  } catch (error) {
    const failure = failureReport(error);
    replaceReports(argv, failure, deps);
    deps.stdout(`${JSON.stringify(failure, null, 2)}\n`);
    if (failure.error.type === 'usage') {
      deps.stderr(`${error.message}\n\n${USAGE}\n`);
      return 2;
    }
    deps.stderr(`internal error: ${(error && error.stack) || error}\n`);
    return 1;
  }
}

// The command line entry: main never rejects, and if it ever does the process still ends with exit 1 and a message.
async function entry(argv, { run = main, stderr = (text) => process.stderr.write(text), exit = (code) => { process.exitCode = code; } } = {}) {
  try {
    exit(await run(argv));
  } catch (error) {
    stderr(`internal error: ${(error && error.stack) || error}\n`);
    exit(1);
  }
}

if (require.main === module) entry(process.argv.slice(2));

module.exports = Object.freeze({ USAGE, parseArgs, displayPath, mapPool, makeRunDirectory, missingFolders, removeCreatedFolders, isEmptyFile, runGate, main, entry });
