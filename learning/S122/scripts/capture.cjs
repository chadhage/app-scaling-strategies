'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  console.error('READ_ONLY: deliberate recording requires exact CAPTURE_BROWSER_EVIDENCE=1.');
  process.exitCode = 2;
} else {
  const root = path.resolve(__dirname, '..');
  const repo = path.resolve(root, '..', '..');
  const stages = {
    'model-red': ['--test', '--test-name-pattern=supported Linux path', 'learning\\S122\\tests\\model.test.cjs'],
    'browser-red': ['--test', '--test-name-pattern=actual DOM supported Linux assessment', 'learning\\S122\\tests\\browser.test.cjs'],
    focused: ['--test', 'learning\\S122\\tests\\model.test.cjs'],
    browser: ['--test', 'learning\\S122\\tests\\browser.test.cjs'],
    final: ['--test', 'learning\\S122\\tests\\model.test.cjs', 'learning\\S122\\tests\\proof.test.cjs', 'learning\\S122\\tests\\integrity.test.cjs'],
    syntax: null,
  };
  const stage = process.argv[2];
  if (process.argv.length !== 3 || !Object.hasOwn(stages, stage)) {
    throw new Error('Choose exactly one documented recording stage.');
  }
  const raw = path.join(root, 'evidence', 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const existing = fs.readdirSync(raw).filter((name) => new RegExp(`^${stage}-\\d{3}\\.json$`).test(name));
  const label = `${stage}-${String(existing.length + 1).padStart(3, '0')}`;
  const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
  function sourceFiles(directory = root, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix ? `${prefix}\\${entry.name}` : entry.name;
      if (!prefix && ['evidence', 'result.json'].includes(entry.name)) return [];
      return entry.isDirectory() ? sourceFiles(path.join(directory, entry.name), relative) : [relative];
    }).sort();
  }
  const sources = sourceFiles();
  const sourceDigests = sources.map((source) => {
    const bytes = fs.readFileSync(path.join(root, source));
    return { path: source, bytes: bytes.length, sha256: digest(bytes) };
  });
  const snapshots = [];
  if (stage.endsWith('-red')) {
    const red = path.join(root, 'evidence', 'red');
    fs.mkdirSync(red, { recursive: true });
    for (const source of sources) {
      const bytes = fs.readFileSync(path.join(root, source));
      const name = `${label}--${source.replaceAll('\\', '__')}.source`;
      fs.writeFileSync(path.join(red, name), bytes, { flag: 'wx' });
      snapshots.push({
        source, path: `evidence\\red\\${name}`, bytes: bytes.length, sha256: digest(bytes),
      });
    }
  }
  const startedAtUtc = new Date().toISOString();
  const childEnvironment = { ...process.env };
  if (!['browser', 'browser-red'].includes(stage)) delete childEnvironment.CAPTURE_BROWSER_EVIDENCE;
  const commands = stage === 'syntax'
    ? sources.filter((source) => /\.(?:js|cjs)$/.test(source)).map((source) => ['--check', `learning\\S122\\${source}`])
    : [stages[stage]];
  const runs = commands.map((args) => {
    const run = spawnSync(process.execPath, args, {
      cwd: repo, env: childEnvironment, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    });
    return { args, ...run };
  });
  const stdout = Buffer.concat(runs.map((run) => run.stdout || Buffer.alloc(0)));
  const stderr = Buffer.concat(runs.map((run) => run.stderr || Buffer.alloc(0)));
  const exitCode = runs.every((run) => run.status === 0) ? 0 : 1;
  fs.writeFileSync(path.join(raw, `${label}.stdout.raw`), stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(raw, `${label}.stderr.raw`), stderr, { flag: 'wx' });
  const record = {
    cardId: 'A-S122', workerId: 'worker-A-S122', stage, startedAtUtc,
    completedAtUtc: new Date().toISOString(), executable: process.execPath,
    command: commands.map((args) => [process.execPath, ...args]), workingDirectory: repo,
    exitCode, signal: runs.find((run) => run.signal)?.signal || null,
    error: runs.find((run) => run.error)?.error.message || null,
    commands: runs.map((run) => ({
      argv: [process.execPath, ...run.args], exitCode: run.status,
      signal: run.signal, error: run.error ? run.error.message : null,
    })),
    childCaptureSwitch: childEnvironment.CAPTURE_BROWSER_EVIDENCE || 'unset',
    sourceDigests, snapshots,
    stdout: { path: `evidence\\raw\\${label}.stdout.raw`, bytes: stdout.length, sha256: digest(stdout) },
    stderr: { path: `evidence\\raw\\${label}.stderr.raw`, bytes: stderr.length, sha256: digest(stderr) },
  };
  const output = stdout.toString('utf8');
  const readCount = (name) => {
    const match = output.match(new RegExp(`^# ${name} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  record.testSummary = stage === 'syntax' ? null : Object.fromEntries(
    ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((name) => [name, readCount(name)]),
  );
  fs.writeFileSync(path.join(raw, `${label}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.log(`Recorded ${label}: ${commands.length} command(s), actual exit ${exitCode}.`);
  process.exitCode = exitCode;
}
