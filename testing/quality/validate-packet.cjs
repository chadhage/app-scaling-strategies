'use strict';
// CLI: node testing\quality\validate-packet.cjs <packet.json | -> [--markdown <file.md>] [--now <ISO instant or YYYY-MM-DD>] [--json]
// Exit 0 = ok, 1 = findings (one line each: CODE path: message), 2 = usage, unreadable input or an internal error (one line, never a stack trace).
// A U001 result file ({ packet, packetMarkdown }) is unwrapped. Only this file reads files, stdin and the clock.
const fs = require('node:fs');
const { validatePacket } = require('./packet-validator.cjs');
const { isObj } = require('./util.cjs');
const { LIMITS } = require('./limits.cjs');
const { parseClock } = require('./dates.cjs');

const USAGE = 'Usage: node testing\\quality\\validate-packet.cjs <packet.json | -> [--markdown <file.md>] [--now <ISO instant or YYYY-MM-DD>] [--json]';

function parseArgs(argv) {
  const args = { file: null, markdown: null, now: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help') return { help: true };
    if (a === '--json') args.json = true;
    else if (a === '--markdown' || a === '--now') {
      if (i + 1 >= argv.length) return { error: `${a} needs a value` };
      args[a.slice(2)] = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--')) return { error: `unknown option ${a}` };
    else if (args.file === null) args.file = a;
    else return { error: `unexpected argument ${a}` };
  }
  return args.file === null ? { error: 'a packet file is required' } : args;
}

function report(result, file, args, env) {
  if (args.json) env.stdout(JSON.stringify(result));
  else if (result.ok) env.stdout(`OK packet accepted (${file}); prices and Learn facts still need an independent lookup`);
  else {
    for (const f of result.findings) env.stdout(`${f.code} ${f.path}: ${f.message}`);
    env.stdout(`${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}`);
  }
  return result.ok ? 0 : 1;
}

function run(argv, env) {
  const args = parseArgs(argv);
  if (args.help) { env.stdout(USAGE); return 0; }
  if (args.error) { env.stderr(`${args.error}\n${USAGE}`); return 2; }
  let now = env.nowUtc ? env.nowUtc() : new Date().toISOString();
  if (args.now !== null) {
    if (Number.isNaN(parseClock(args.now))) { env.stderr(`--now must be an ISO instant (2026-11-06T07:00:00Z) or a date (2026-11-06): ${args.now}`); return 2; }
    now = args.now;
  }
  let input;
  let markdown;
  try {
    const text = env.read(args.file);
    if (text.length > LIMITS.maxJsonBytes) return report({ ok: false, findings: [{ code: 'INPUT_TOO_LARGE', path: args.file, message: `the input is longer than ${LIMITS.maxJsonBytes} characters` }] }, args.file, args, env);
    input = JSON.parse(text);
    if (args.markdown !== null) markdown = env.read(args.markdown);
  } catch (error) {
    if (error instanceof RangeError) return report({ ok: false, findings: [{ code: 'INPUT_TOO_DEEP', path: args.file, message: 'the JSON is nested too deeply to read' }] }, args.file, args, env);
    env.stderr(`cannot read the input: ${error.message}`);
    return 2;
  }
  const wrapped = isObj(input) && isObj(input.packet);
  const packet = wrapped ? input.packet : input;
  if (markdown === undefined && wrapped && typeof input.packetMarkdown === 'string') markdown = input.packetMarkdown;
  return report(validatePacket(packet, { nowUtc: now, markdown }), args.file, args, env);
}

// Everything is caught: a hostile input ends in one line and a non-zero exit, never a stack trace.
function main(argv, io) {
  const env = io || defaultIo();
  try {
    return run(argv, env);
  } catch (error) {
    env.stderr(`internal error: ${String(error && error.message).slice(0, 200)}`);
    return 2;
  }
}

function defaultIo() {
  return {
    read: (file) => fs.readFileSync(file === '-' ? 0 : file, 'utf8'),
    stdout: (s) => process.stdout.write(`${s}\n`),
    stderr: (s) => process.stderr.write(`${s}\n`)
  };
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { main, parseArgs, USAGE, defaultIo };
