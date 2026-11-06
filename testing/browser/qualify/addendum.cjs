'use strict';

// Append-only addendum of qualified Edge majors (review N1). qualified.json stays sealed: it is the list the tool shipped with, and
// every test and every archive pins it. A newly qualified major is ADDED as one line of qualified.addendum.jsonl, never by editing
// qualified.json. Each line is canonical JSON, fixed key order, and chained by SHA-256: the first line names the digest of the sealed
// file (CRLF turned into LF, because the repository stores LF and a Windows checkout turns it into CRLF), every other line names the
// digest of the previous line. An edited, deleted, reordered or duplicated EARLIER line breaks the chain. The chain does not
// protect the last line against a rewrite by someone who can write this folder: git history and the report digest are the anchors.
// Everything that is not exactly right is refused (fails closed), including a symbolic link or a junction in place of the file.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseVersion, validateQualifiedMajors } = require('./version.cjs');

const SEALED_FILE = path.join(__dirname, 'qualified.json');
const ADDENDUM_FILE = path.join(__dirname, 'qualified.addendum.jsonl');
const MAX_BYTES = 65536;
const MAX_LINES = 200;
const MAX_MAJOR = 65535;
const MAX_REPORT_BYTES = 1048576;
const KEYS = ['major', 'version', 'binarySha256', 'reportSha256', 'previous', 'atUtc'];
const HEX = /^[0-9a-f]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUIRED_ORGANIZATION = 'Microsoft Corporation';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const oneLine = (value) => String(value).replace(/\s+/g, ' ').trim();
const toLf = (bytes) => Buffer.from(Buffer.from(bytes).toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const anchorOf = (sealedBytes) => sha256(toLf(sealedBytes));
const addendumFileFor = (qualifiedFile) => path.join(path.dirname(qualifiedFile), `${path.basename(qualifiedFile, '.json')}.addendum.jsonl`);
const isUtcTime = (text) => {
  if (typeof text !== 'string' || !UTC.test(text)) return false;
  const date = new Date(text);
  return !Number.isNaN(date.getTime()) && date.toISOString() === text;
};
const refuse = (error) => ({ ok: false, error });

function badByte(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return 'the file starts with a byte order mark';
  if (buffer.includes(0x0d)) return 'the file contains a carriage return (the lines end with a line feed only)';
  if (buffer.some((byte) => byte !== 0x0a && (byte < 0x20 || byte > 0x7e))) return 'the file contains a byte that is not printable ASCII';
  return null;
}

// One line: the checks run in this order, so every anomaly is refused with its OWN reason.
function lineProblem(line, number, state) {
  const label = `line ${number}`;
  if (line === '') return `${label} is blank`;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return `${label} is not valid JSON`;
  }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return `${label} is not a JSON object`;
  if (Object.keys(entry).join(',') !== KEYS.join(',')) return `${label} does not have exactly the keys ${KEYS.join(', ')}`;
  if (JSON.stringify(entry) !== line) return `${label} is not in canonical form (compact JSON, the keys in this order, no duplicate key)`;
  const top = Math.max(...state.sealedMajors);
  if (!Number.isInteger(entry.major) || entry.major <= top || entry.major > MAX_MAJOR) return `${label}: major must be an integer above ${top} and at most ${MAX_MAJOR}`;
  const version = parseVersion(entry.version);
  if (!version.ok || version.major !== entry.major) return `${label}: version is not major.minor.build.patch of the same major`;
  for (const key of ['binarySha256', 'reportSha256', 'previous']) {
    if (typeof entry[key] !== 'string' || !HEX.test(entry[key])) return `${label}: ${key} is not 64 lowercase hex digits`;
  }
  if (!isUtcTime(entry.atUtc)) return `${label}: atUtc is not a UTC time like 2026-11-07T09:00:00.000Z`;
  if (entry.previous !== state.previous) return number === 1 ? `${label}: previous does not match qualified.json` : `${label}: previous does not match the previous line`;
  if (state.majors.includes(entry.major)) return `${label}: major ${entry.major} is listed twice`;
  return entry;
}

// buffer: the bytes of the addendum; anchor: digest of the sealed file; sealedMajors: its majors.
function parseAddendum(buffer, { anchor, sealedMajors }) {
  if (buffer.length === 0) return refuse('the file is empty');
  if (buffer.length > MAX_BYTES) return refuse(`the file is larger than ${MAX_BYTES} bytes`);
  const odd = badByte(buffer);
  if (odd !== null) return refuse(odd);
  if (buffer[buffer.length - 1] !== 0x0a) return refuse('the file does not end with a line feed');
  const lines = buffer.toString('latin1').slice(0, -1).split('\n');
  if (lines.length > MAX_LINES) return refuse(`the file has more than ${MAX_LINES} lines`);
  const state = { sealedMajors, previous: anchor, majors: [] };
  const entries = [];
  for (let i = 0; i < lines.length; i += 1) {
    const found = lineProblem(lines[i], i + 1, state);
    if (typeof found === 'string') return refuse(found);
    entries.push(found);
    state.majors.push(found.major);
    state.previous = sha256(Buffer.from(lines[i], 'latin1'));
  }
  return { ok: true, entries, majors: state.majors, head: state.previous, lines: entries.length };
}

function readAddendum(file, { anchor, sealedMajors, fsApi = fs }) {
  let stat;
  try {
    stat = fsApi.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: true, absent: true, entries: [], majors: [], head: anchor, lines: 0 };
    return refuse(`the file cannot be read (${error.code || oneLine(error.message)})`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return refuse('the file is not a regular file');
  if (stat.size > MAX_BYTES) return refuse(`the file is larger than ${MAX_BYTES} bytes`);
  let buffer;
  try {
    buffer = Buffer.from(fsApi.readFileSync(file));
  } catch (error) {
    return refuse(`the file cannot be read (${error.code || oneLine(error.message)})`);
  }
  return parseAddendum(buffer, { anchor, sealedMajors });
}

// The sealed file and its addendum together: { ok, sealedMajors, majors, entries, anchor, head, lines } or { ok: false, code, error }.
function verifyFiles({ qualifiedFile = SEALED_FILE, addendumFile = addendumFileFor(qualifiedFile), fsApi = fs } = {}) {
  const invalid = (code, error) => ({ ok: false, code, error });
  let sealed;
  let data;
  try {
    sealed = Buffer.from(fsApi.readFileSync(qualifiedFile));
    data = JSON.parse(sealed.toString('utf8'));
  } catch (error) {
    return invalid('QUALIFIED_MAJORS_INVALID', `the sealed file cannot be read as JSON (${error.code || oneLine(error.message)})`);
  }
  const majors = validateQualifiedMajors(data);
  if (!majors.ok) return invalid('QUALIFIED_MAJORS_INVALID', majors.error);
  const anchor = anchorOf(sealed);
  const found = readAddendum(addendumFile, { anchor, sealedMajors: majors.majors, fsApi });
  if (!found.ok) return invalid('QUALIFIED_ADDENDUM_INVALID', found.error);
  return {
    ok: true, data, sealedMajors: majors.majors, majors: [...majors.majors, ...found.majors], entries: found.entries, anchor, head: found.head, lines: found.lines,
  };
}

const sameEdge = (report, other) => other && other.path === report.path && other.version === report.version && other.sha256 === report.sha256;

function suiteProblem(report, suites) {
  if (!Array.isArray(suites) || suites.length === 0) return 'no suite is listed in the report';
  const wanted = require('./requalify.cjs').SUITES;
  if (suites.map((suite) => suite && suite.file).join(',') !== wanted.join(',')) return `the report does not list exactly the suites ${wanted.join(' and ')}`;
  for (const suite of suites) {
    const whole = suite.passed === true && suite.testsPassed === true && suite.timedOut === false && suite.tests > 0 && suite.pass === suite.tests
      && suite.fail === 0 && suite.skipped === 0 && suite.todo === 0 && suite.cancelled === 0;
    if (!whole) return `a suite did not pass every test (${suite.file})`;
    if (!Array.isArray(suite.browserVersionsSeen) || suite.browserVersionsSeen.length !== 1 || suite.browserVersionsSeen[0] !== report.version) {
      return `a suite did not print the browser version of the report (${suite.file})`;
    }
  }
  return null;
}

// Does this report prove that the installed Edge passed the requalification? { ok, major, version, sha256 } or { ok: false, error }.
function checkReport(report, { sealedMajors, knownMajors = sealedMajors }) {
  if (report === null || typeof report !== 'object' || Array.isArray(report) || report.schemaVersion !== 1) {
    return refuse('the file is not a requalification report of this tool');
  }
  const run = report.requalification;
  if (run === null || typeof run !== 'object' || run.ran !== true) return refuse('the report did not run the isolated suites');
  if (run.passed !== true) return refuse('the requalification did not pass');
  const codes = Array.isArray(report.reasonCodes) ? report.reasonCodes : [];
  if (report.ok === true || codes.length === 0) return refuse('the major is already qualified: there is nothing to add');
  if (codes.length !== 1 || codes[0] !== 'MAJOR_NOT_QUALIFIED') return refuse(`the report lists other failures than MAJOR_NOT_QUALIFIED: ${codes.join(', ')}`);
  const signature = report.signature;
  if (!signature || signature.status !== 'Valid' || signature.publisher !== REQUIRED_ORGANIZATION) return refuse(`the signature is not Valid by ${REQUIRED_ORGANIZATION}`);
  const version = parseVersion(report.version);
  if (!version.ok || version.major !== report.major) return refuse('the version is not major.minor.build.patch of the report major');
  if (typeof report.sha256 !== 'string' || !HEX.test(report.sha256)) return refuse('the sha256 is not 64 lowercase hex digits');
  const top = Math.max(...sealedMajors);
  if (!Number.isInteger(report.major) || report.major <= top || report.major > MAX_MAJOR) return refuse(`the major ${report.major} is not above the sealed majors [${sealedMajors.join(', ')}]`);
  if (knownMajors.includes(report.major)) return refuse(`major ${report.major} is already listed`);
  if (run.candidateMajor !== report.major) return refuse('the requalification was run for another major');
  const problem = suiteProblem(report, run.suites);
  if (problem !== null) return refuse(problem);
  if (run.edgeChangedDuringRun !== false || !sameEdge(report, run.edgeAfter)) return refuse('the Edge changed during the run');
  return { ok: true, major: report.major, version: report.version, sha256: report.sha256 };
}

function loadReport(reportPath, fsApi) {
  let bytes;
  try {
    if (fsApi.statSync(reportPath).size > MAX_REPORT_BYTES) return refuse(`the report is larger than ${MAX_REPORT_BYTES} bytes`);
    bytes = Buffer.from(fsApi.readFileSync(reportPath));
  } catch (error) {
    return refuse(`the report cannot be read (${error.code || oneLine(error.message)})`);
  }
  try {
    return { ok: true, bytes, data: JSON.parse(bytes.toString('utf8')) };
  } catch {
    return refuse('the report cannot be read as JSON');
  }
}

// The qualification of the installed Edge with the candidate major added to the list that is known.
function machineCheck(major, knownMajors, qualify) {
  return qualify({ adapters: { readQualified: () => ({ schemaVersion: 1, qualifiedMajors: [...knownMajors, major] }) } });
}
const defaultVerify = (major, knownMajors) => machineCheck(major, knownMajors, require('./qualify.cjs').qualifyEdge);

function edgeProblem(found, expected) {
  const good = found && found.ok === true && found.version === expected.version && found.major === expected.major && found.sha256 === expected.sha256
    && found.signature && found.signature.status === 'Valid' && found.signature.publisher === REQUIRED_ORGANIZATION;
  return good ? null : 'the installed Edge does not match the report (version, sha256, signature or the qualification check differ)';
}

// Runs work() while this process holds <addendum>.lock (created exclusively); a lock that was not created here is never removed.
function withLock(addendumFile, fsApi, work) {
  const lock = `${addendumFile}.lock`;
  let handle;
  try {
    handle = fsApi.openSync(lock, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') return refuse(`another append is running or a stale lock exists (${path.basename(lock)}): nothing was written`);
    return refuse(`the lock cannot be created (${error.code || oneLine(error.message)})`);
  }
  try {
    return work();
  } finally {
    fsApi.closeSync(handle);
    fsApi.rmSync(lock, { force: true });
  }
}

// The new content = the existing addendum + ONE line, parsed again completely before anything is written.
function buildAppend({ qualifiedFile, addendumFile, fsApi, checked, reportBytes, now }) {
  const files = verifyFiles({ qualifiedFile, addendumFile, fsApi });
  if (!files.ok) {
    return refuse(files.code === 'QUALIFIED_ADDENDUM_INVALID' ? `the existing addendum cannot be used: ${files.error}` : `the sealed list cannot be used: ${files.error}`);
  }
  const line = JSON.stringify({
    major: checked.major, version: checked.version, binarySha256: checked.sha256, reportSha256: sha256(reportBytes), previous: files.head, atUtc: new Date(now()).toISOString(),
  });
  const existing = files.lines === 0 ? '' : Buffer.from(fsApi.readFileSync(addendumFile)).toString('latin1');
  const content = `${existing}${line}\n`;
  const parsed = parseAddendum(Buffer.from(content, 'latin1'), { anchor: files.anchor, sealedMajors: files.sealedMajors });
  return parsed.ok ? { ok: true, line, content } : refuse(`the new line cannot be added: ${parsed.error}`);
}

// Write the new content next to the file and rename it over the file, so a reader sees the old or the new file, never a part.
function replaceFile(addendumFile, content, fsApi) {
  const temporary = `${addendumFile}.${process.pid}.tmp`;
  try {
    fsApi.writeFileSync(temporary, content, { flag: 'wx' });
    fsApi.renameSync(temporary, addendumFile);
    return { ok: true };
  } catch (error) {
    fsApi.rmSync(temporary, { force: true });
    return refuse(`the addendum cannot be written (${error.code || oneLine(error.message)})`);
  }
}

// Appends ONE line from a passing requalification report: { ok, line, major, version, dryRun } or { ok: false, error }.
async function appendFromReport(options) {
  const { reportPath, qualifiedFile = SEALED_FILE, dryRun = false, fsApi = fs } = options;
  const addendumFile = options.addendumFile || addendumFileFor(qualifiedFile);
  const now = options.now || (() => new Date());
  const loaded = loadReport(reportPath, fsApi);
  if (!loaded.ok) return loaded;
  const files = verifyFiles({ qualifiedFile, addendumFile, fsApi });
  if (!files.ok) {
    return refuse(files.code === 'QUALIFIED_ADDENDUM_INVALID' ? `the existing addendum cannot be used: ${files.error}` : `the sealed list cannot be used: ${files.error}`);
  }
  const checked = checkReport(loaded.data, { sealedMajors: files.sealedMajors, knownMajors: files.majors });
  if (!checked.ok) return checked;
  const mismatch = edgeProblem(await (options.verify || defaultVerify)(checked.major, files.majors), checked);
  if (mismatch !== null) return refuse(mismatch);
  const build = () => buildAppend({ qualifiedFile, addendumFile, fsApi, checked, reportBytes: loaded.bytes, now });
  const result = { major: checked.major, version: checked.version, dryRun };
  if (dryRun) {
    const built = build();
    return built.ok ? { ok: true, line: built.line, ...result } : built;
  }
  // Everything that decides the new line is read again while the lock is held, so two runs never chain to the same line.
  return withLock(addendumFile, fsApi, () => {
    const built = build();
    if (!built.ok) return built;
    const written = replaceFile(addendumFile, built.content, fsApi);
    return written.ok ? { ok: true, line: built.line, ...result } : written;
  });
}

const USAGE = [
  'Usage: node testing\\browser\\qualify\\addendum.cjs --check',
  '       node testing\\browser\\qualify\\addendum.cjs --report <requalification-report.json> [--dry-run]',
  '  --check          verify qualified.json and qualified.addendum.jsonl together (every rule, the whole chain) and list the qualified majors',
  '  --report <file>  append the major of a PASSING --requalify report (written with --json) to qualified.addendum.jsonl: the report and the',
  '                   installed Edge are checked again, then ONE line is written atomically; qualified.json is never touched',
  '  --dry-run        with --report: do every check and print the line, write nothing',
  '  stdout is the JSON answer (--check) or the line (--report), stderr one line; exit 0 done, 1 refused (fails closed), 2 usage',
  '',
].join('\n');

function parseArgs(argv) {
  const options = { check: false, report: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--check' || arg === '--dry-run') {
      const key = arg === '--check' ? 'check' : 'dryRun';
      if (options[key]) return { error: `${arg} was given twice` };
      options[key] = true;
    } else if (arg === '--report') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: '--report needs a file' };
      if (options.report !== null) return { error: '--report was given twice' };
      options.report = value;
      i += 1;
    } else {
      return { error: `unknown argument ${JSON.stringify(arg)}` };
    }
  }
  if (options.help) return { options };
  if (options.check === (options.report !== null)) return { error: 'give exactly one of --check and --report <file>' };
  if (options.dryRun && options.report === null) return { error: '--dry-run goes with --report' };
  return { options };
}

const listLabel = (majors) => (majors.length === 0 ? 'no addendum' : `addendum [${majors.join(', ')}] (${majors.length} line${majors.length === 1 ? '' : 's'})`);

async function run(argv, io) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  const parsed = parseArgs(argv);
  if (parsed.error) {
    err.write(`${parsed.error}\n${USAGE}`);
    return 2;
  }
  const { options } = parsed;
  if (options.help) {
    out.write(USAGE);
    return 0;
  }
  const qualifiedFile = io.qualifiedFile || SEALED_FILE;
  const addendumFile = io.addendumFile || addendumFileFor(qualifiedFile);
  const label = path.basename(addendumFile);
  if (options.check) {
    const files = verifyFiles({ qualifiedFile, addendumFile, fsApi: io.fs || fs });
    if (!files.ok) {
      err.write(`FAIL closed: ${files.code}: ${files.error}\n`);
      return 1;
    }
    const added = files.majors.slice(files.sealedMajors.length);
    out.write(`${JSON.stringify({ ok: true, sealedMajors: files.sealedMajors, majors: files.majors, lines: files.lines, anchor: files.anchor, head: files.head }, null, 2)}\n`);
    err.write(`OK qualified list: sealed [${files.sealedMajors.join(', ')}] and ${listLabel(added)}\n`);
    return 0;
  }
  const result = await appendFromReport({
    reportPath: options.report, qualifiedFile, addendumFile, dryRun: options.dryRun, verify: io.verify, now: io.now, fsApi: io.fs || fs,
  });
  if (!result.ok) {
    err.write(`FAIL closed: ${oneLine(result.error)}\n`);
    return 1;
  }
  out.write(`${result.line}\n`);
  err.write(`${options.dryRun ? 'DRY RUN would append' : 'APPENDED'} major ${result.major} (${result.version}) to ${label}\n`);
  return 0;
}

async function main(argv, io = {}) {
  try {
    return await run(argv, io);
  } catch (error) {
    try {
      (io.stderr || process.stderr).write(`FAIL closed: the helper itself failed: ${oneLine(error && error.message !== undefined ? error.message : error)}\n`);
    } catch {
      // stderr is broken as well: the exit code still says failure
    }
    return 1;
  }
}

module.exports = {
  SEALED_FILE, ADDENDUM_FILE, MAX_BYTES, MAX_LINES, KEYS, USAGE,
  anchorOf, addendumFileFor, parseAddendum, readAddendum, verifyFiles, checkReport, machineCheck, appendFromReport, parseArgs, main,
};

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
}
