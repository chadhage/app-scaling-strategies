'use strict';

// Command line of the Edge qualification: node testing\browser\qualify\qualify.cjs [--json <out>] [--timeout-ms <n>] [--requalify]
// Exit 0 when Edge is qualified (and, with --requalify, the isolated suites passed), 1 when it fails closed, 2 for a usage error
// or a --json target that is refused (checked before anything runs). A check prints its verdict as ONE stderr line.
const fs = require('node:fs');
const path = require('node:path');
const { qualifyEdge, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, TIMEOUT_ENV } = require('./qualify.cjs');
const { requalifyEdge, createSlot } = require('./requalify.cjs');

const USAGE = [
  'Usage: node testing\\browser\\qualify\\qualify.cjs [--json <out>] [--timeout-ms <n>] [--requalify [--slot-script <heavy-slot.ps1> --slot-owner <name>]]',
  '  --json <out>     also write the JSON report to <out>; checked before anything runs: never overwrites, no reserved device name,',
  '                   trailing dot or space, colon after the drive letter or UNC path, and the folder must exist',
  `  --timeout-ms <n> every adapter call may take n ms (1 to ${MAX_TIMEOUT_MS}; default ${DEFAULT_TIMEOUT_MS}); the one PowerShell start is ended at 75 percent of it;`,
  `                   the environment variable ${TIMEOUT_ENV} sets the same value, the flag wins; a timeout fails the check, it never passes it`,
  '  --requalify      run testing\\browser\\isolated.test.cjs and loopback.test.cjs on the installed Edge and record the counts',
  '  --slot-script    with --requalify: take a heavy-run slot through this PowerShell script (-Action Acquire|Release -Owner <name>)',
  '  stdout is the JSON report, stderr one verdict line (usage errors print this text); exit 0 qualified, 1 fails closed, 2 usage',
  '',
].join('\n');

const RESERVED_NAME = /^(?:CON|PRN|AUX|NUL|COM[0-9\u00B9\u00B2\u00B3]|LPT[0-9\u00B9\u00B2\u00B3]|CONIN\$|CONOUT\$)$/i;
const oneLine = (text) => String(text).replace(/\s+/g, ' ').trim();

// Windows accepts names that its own tools cannot delete (device names, trailing dots and spaces) and "file:stream"
// attaches an alternate data stream to an existing file, so such targets are refused before a long run starts.
function nameProblem(target) {
  if (target === '') return 'it is empty';
  if (/[\u0000-\u001F<>"|?*]/.test(target)) return 'it contains a control or wildcard character';
  if (/^[\\/]{2}/.test(target)) return 'UNC and device paths are not allowed';
  const rest = /^[A-Za-z]:/.test(target) ? target.slice(2) : target;
  if (rest.includes(':')) return 'a colon after the drive letter would address an alternate data stream';
  for (const segment of rest.split(/[\\/]+/)) {
    if (segment === '' || segment === '.' || segment === '..') continue;
    if (/[. ]$/.test(segment)) return `the name ${JSON.stringify(segment)} ends with a dot or a space`;
    if (RESERVED_NAME.test(segment.split('.')[0].replace(/ +$/, ''))) return `${JSON.stringify(segment)} is a reserved device name`;
  }
  return null;
}

function checkJsonTarget(target, fsApi = fs) {
  const quoted = JSON.stringify(target);
  const problem = nameProblem(target);
  if (problem) return `invalid --json target ${quoted}: ${problem}`;
  try {
    fsApi.lstatSync(target);
    return `cannot write ${quoted}: the file already exists, --json never overwrites`;
  } catch (error) {
    if (error.code !== 'ENOENT') return `invalid --json target ${quoted}: it cannot be inspected (${error.code || oneLine(error.message)})`;
  }
  try {
    if (!fsApi.statSync(path.dirname(target)).isDirectory()) return `invalid --json target ${quoted}: its parent is not a folder`;
  } catch {
    return `invalid --json target ${quoted}: the folder does not exist`;
  }
  return null;
}

function parseTimeoutFlag(value) {
  return /^[1-9]\d*$/.test(value) && Number(value) <= MAX_TIMEOUT_MS ? Number(value) : null;
}

function parseArgs(argv) {
  const options = { json: null, requalify: false, help: false, slotScript: null, slotOwner: null, timeoutMs: null };
  const valued = { '--json': 'json', '--slot-script': 'slotScript', '--slot-owner': 'slotOwner', '--timeout-ms': 'timeoutMs' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--requalify') {
      options.requalify = true;
    } else if (Object.hasOwn(valued, arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value` };
      if (options[valued[arg]] !== null) return { error: `${arg} was given twice` };
      if (arg === '--timeout-ms') {
        const milliseconds = parseTimeoutFlag(value);
        if (milliseconds === null) return { error: `--timeout-ms must be an integer number of milliseconds from 1 to ${MAX_TIMEOUT_MS} (got ${JSON.stringify(value)})` };
        options.timeoutMs = milliseconds;
      } else {
        options[valued[arg]] = value;
      }
      i += 1;
    } else {
      return { error: `unknown argument ${JSON.stringify(arg)}` };
    }
  }
  if ((options.slotScript === null) !== (options.slotOwner === null)) {
    return { error: '--slot-script and --slot-owner go together' };
  }
  if (options.slotScript !== null && !options.requalify) return { error: 'the slot options need --requalify' };
  return { options };
}

// Reasons that carry the same text (SIGNATURE_UNAVAILABLE and VERSION_UNAVAILABLE repeat the shell's message) are
// listed once under all their codes; the full text stays in the JSON report.
function joinReasons(reasons) {
  const groups = new Map();
  for (const reason of reasons) {
    const parts = /^([A-Z][A-Z0-9_]*): (.*)$/.exec(oneLine(reason));
    const [code, message] = parts ? [parts[1], parts[2]] : ['', oneLine(reason)];
    const codes = groups.get(message) || [];
    if (code !== '' && !codes.includes(code)) codes.push(code);
    groups.set(message, codes);
  }
  return [...groups].map(([message, codes]) => (codes.length > 0 ? `${codes.join(', ')}: ${message}` : message)).join(' | ');
}

function verdict(report) {
  const requalification = report.requalification;
  const ran = Boolean(requalification && requalification.ran);
  const counts = ran ? `isolated suites ${requalification.totals.pass}/${requalification.totals.tests} passed` : '';
  const suites = ran && Array.isArray(requalification.suites) ? requalification.suites.map((suite) => `${suite.file} ${suite.pass}/${suite.tests}`) : [];
  if (report.ok) {
    const detail = suites.length > 0 ? ` (${suites.join(', ')})` : '';
    const tail = ran ? `, ${counts}${detail}` : '';
    return oneLine(`PASS Edge ${report.version} at ${report.path}: signed by ${report.signature.publisher}, major ${report.major} qualified, sha256 ${report.sha256}${tail}`);
  }
  const suffix = ran ? ` (${counts}${suites.length > 0 ? `: ${suites.join(', ')}` : ''})` : '';
  return `FAIL closed: ${joinReasons(report.reasons)}${suffix}`;
}

async function run(argv, io) {
  const out = io.stdout || process.stdout;
  const err = io.stderr || process.stderr;
  const write = io.writeFile || ((file, data) => fs.writeFileSync(file, data, { flag: 'wx' }));
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
  if (options.json !== null) {
    const problem = checkJsonTarget(options.json, io.fs || fs);
    if (problem) {
      err.write(`${problem}\n`);
      return 2;
    }
  }
  const qualifyOptions = options.timeoutMs === null ? io.qualifyOptions : { ...io.qualifyOptions, timeoutMs: options.timeoutMs };
  const report = options.requalify
    ? await (io.requalify || requalifyEdge)({
      qualifyOptions,
      slot: options.slotScript ? createSlot({ script: options.slotScript, owner: options.slotOwner }) : undefined,
    })
    : await (io.qualify || qualifyEdge)(qualifyOptions);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  out.write(json);
  let line = verdict(report);
  let code = report.ok ? 0 : 1;
  if (options.json !== null) {
    try {
      write(options.json, json);
    } catch (error) {
      line = `${line} | cannot write ${options.json}: ${oneLine(error.message)}`;
      code = 2;
    }
  }
  err.write(`${line}\n`);
  return code;
}

// L-0141: whatever goes wrong (the check, a broken stdout, a throwing hook) is ONE typed line and exit 1, never a stack trace or an
// unhandled rejection whose exit code depends on NODE_OPTIONS=--unhandled-rejections.
async function main(argv, io = {}) {
  try {
    return await run(argv, io);
  } catch (error) {
    try {
      (io.stderr || process.stderr).write(`FAIL closed: the check itself failed: ${oneLine(error && error.message !== undefined ? error.message : error)}\n`);
    } catch {
      // stderr is broken as well: the exit code still says failure
    }
    return 1;
  }
}

module.exports = { USAGE, parseArgs, verdict, main };
