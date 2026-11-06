'use strict';
// CLI: node testing\quality\validate-packet.cjs <packet.json | -> [--markdown <file.md>] [--now <ISO date>] [--json]
// Exit 0 = ok, 1 = findings (one line each: CODE path: message), 2 = usage or unreadable input.
// A U001 result file ({ packet, packetMarkdown }) is unwrapped. Only this file reads files, stdin and the clock.
const fs = require('node:fs');
const { validatePacket } = require('./packet-validator.cjs');
const { isObj } = require('./util.cjs');

const USAGE = 'Usage: node testing\\quality\\validate-packet.cjs <packet.json | -> [--markdown <file.md>] [--now <ISO date>] [--json]';

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

function main(argv, io) {
  const env = io || defaultIo();
  const args = parseArgs(argv);
  if (args.help) { env.stdout(USAGE); return 0; }
  if (args.error) { env.stderr(`${args.error}\n${USAGE}`); return 2; }
  let now = env.nowUtc ? env.nowUtc() : new Date().toISOString();
  if (args.now !== null) {
    if (Number.isNaN(Date.parse(args.now))) { env.stderr(`--now is not a date: ${args.now}`); return 2; }
    now = args.now;
  }
  let input;
  let markdown;
  try {
    input = JSON.parse(env.read(args.file));
    if (args.markdown !== null) markdown = env.read(args.markdown);
  } catch (error) {
    env.stderr(`cannot read the input: ${error.message}`);
    return 2;
  }
  const wrapped = isObj(input) && isObj(input.packet);
  const packet = wrapped ? input.packet : input;
  if (markdown === undefined && wrapped && typeof input.packetMarkdown === 'string') markdown = input.packetMarkdown;
  const result = validatePacket(packet, { nowUtc: now, markdown });
  if (args.json) env.stdout(JSON.stringify(result));
  else if (result.ok) env.stdout(`OK packet accepted (${args.file}); prices and Learn facts still need an independent lookup`);
  else {
    for (const f of result.findings) env.stdout(`${f.code} ${f.path}: ${f.message}`);
    env.stdout(`${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}`);
  }
  return result.ok ? 0 : 1;
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
