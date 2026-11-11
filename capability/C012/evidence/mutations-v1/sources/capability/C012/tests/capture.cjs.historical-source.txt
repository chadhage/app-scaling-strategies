'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { run, remaining, write, DEADLINE } = require('./budget.cjs');
const root = path.resolve(__dirname, '..', '..', '..');
const namespace = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const name = process.argv[2], expected = Number(process.argv[3]), args = process.argv.slice(4);
if (!/^[a-z0-9-]+$/.test(name) || !args.length) throw new Error('Closed capture name/command required');
remaining(60000);
const out = path.join(namespace, 'evidence', name);
fs.mkdirSync(out, { recursive: false });
const files = [];
function enumerate(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'evidence') continue;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No aliases');
    if (entry.isDirectory()) enumerate(file); else files.push(file);
  }
}
enumerate(namespace);
const imports = JSON.parse(fs.readFileSync(path.join(namespace, 'imports.json')));
for (const item of imports.entries) files.push(path.join(root, item.path));
const inputs = [...new Set(files)].sort().map(file => {
  const bytes = fs.readFileSync(file), relative = path.relative(root, file);
  const target = path.join(out, 'sources', relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
  return { path: relative, bytes: bytes.length, sha256: sha(bytes), lfSha256: sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))) };
});
const sourceCapturedAtUtc = new Date().toISOString(), startedAtUtc = new Date().toISOString();
const result = run(args, { timeout: Math.min(remaining(60000), Number(process.env.C012_CAPTURE_TIMEOUT || 1200000)) });
const completedAtUtc = new Date().toISOString();
function stream(kind, bytes) {
  const raw = bytes || Buffer.alloc(0), gzip = zlib.gzipSync(raw);
  fs.writeFileSync(path.join(out, kind + '.raw.gz'), gzip, { flag: 'wx' });
  return { file: kind + '.raw.gz', rawBytes: raw.length, rawSha256: sha(raw), gzipSha256: sha(gzip) };
}
const manifest = {
  schema: 'C012-original-byte-source-complete-capture/1', name, deadlineUtc: DEADLINE,
  sourceCapturedAtUtc, startedAtUtc, completedAtUtc, timestampPrecision: 'UTC milliseconds; exact native UTC7/FILETIME is in private process journal',
  command: [process.execPath, ...args], cwd: root, expectedExit: expected, exit: result.status,
  error: result.error ? { code: result.error.code, message: result.error.message } : null, signal: result.signal,
  synchronousChild: { pid: result.pid, fullyReaped: result.status !== null, noBirthNoAdoptionOrKillAuthority: true },
  inputs, stdout: stream('stdout', result.stdout), stderr: stream('stderr', result.stderr)
};
write(path.join(out, 'manifest.json'), manifest);
const text = (result.stdout || Buffer.alloc(0)).toString();
console.log(JSON.stringify({ name, exit: result.status, expected, sources: inputs.length, failures: [...text.matchAll(/^not ok .+$/gm)].map(item => item[0]) }));
if (result.error || result.signal || result.status !== expected) process.exitCode = 1;
