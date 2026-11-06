'use strict';

// Command line of the Edge qualification: node testing\browser\qualify\qualify.cjs [--json <out>] [--requalify]
// Exit 0 when Edge is qualified (and, with --requalify, the isolated suites passed), 1 when it fails closed, 2 for a usage error.
const fs = require('node:fs');
const { qualifyEdge } = require('./qualify.cjs');
const { requalifyEdge, createSlot } = require('./requalify.cjs');

const USAGE = [
  'Usage: node testing\\browser\\qualify\\qualify.cjs [--json <out>] [--requalify [--slot-script <heavy-slot.ps1> --slot-owner <name>]]',
  '  --json <out>     also write the JSON report to <out> (never overwrites an existing file)',
  '  --requalify      run testing\\browser\\isolated.test.cjs and loopback.test.cjs on the installed Edge and record the counts',
  '  --slot-script    with --requalify: take a heavy-run slot through this PowerShell script (-Action Acquire|Release -Owner <name>)',
  '  stdout is the JSON report, stderr one verdict line; exit 0 qualified, 1 fails closed, 2 usage',
  '',
].join('\n');

function parseArgs(argv) {
  const options = { json: null, requalify: false, help: false, slotScript: null, slotOwner: null };
  const valued = { '--json': 'json', '--slot-script': 'slotScript', '--slot-owner': 'slotOwner' };
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
      options[valued[arg]] = value;
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

function verdict(report) {
  const requalification = report.requalification;
  if (report.ok) {
    const suites = requalification && requalification.ran ? `, isolated suites ${requalification.totals.pass}/${requalification.totals.tests} passed` : '';
    return `PASS Edge ${report.version} at ${report.path}: signed by ${report.signature.publisher}, major ${report.major} qualified, sha256 ${report.sha256}${suites}`;
  }
  const suffix = requalification && requalification.ran
    ? ` (isolated suites ${requalification.totals.pass}/${requalification.totals.tests} passed)` : '';
  return `FAIL closed: ${report.reasons.join(' | ')}${suffix}`;
}

async function main(argv, io = {}) {
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
  let report;
  try {
    report = options.requalify
      ? await (io.requalify || requalifyEdge)({
        qualifyOptions: io.qualifyOptions,
        slot: options.slotScript ? createSlot({ script: options.slotScript, owner: options.slotOwner }) : undefined,
      })
      : await (io.qualify || qualifyEdge)(io.qualifyOptions);
  } catch (error) {
    err.write(`FAIL closed: the check itself failed: ${error.message}\n`);
    return 1;
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  out.write(json);
  err.write(`${verdict(report)}\n`);
  if (options.json !== null) {
    try {
      write(options.json, json);
    } catch (error) {
      err.write(`cannot write ${options.json}: ${error.message}\n`);
      return 2;
    }
  }
  return report.ok ? 0 : 1;
}

module.exports = { USAGE, parseArgs, verdict, main };
