'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const phase = process.argv[2];
if (!['red', 'green'].includes(phase) || process.argv.length !== 3) throw new Error('Deliberate proof command requires exactly red or green.');
const destination = path.join(root, 'evidence', phase);
if (fs.existsSync(destination) && fs.readdirSync(destination).length) {
  throw new Error('Historical proof already exists; refusing to overwrite any retained record.');
}
fs.mkdirSync(destination, { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tests = phase === 'red' ? ['tests\\model.test.cjs'] : ['tests\\model.test.cjs', 'tests\\integrity.test.cjs'];
const args = ['--test', ...tests.map((file) => path.join(root, file))];
const result = spawnSync(process.execPath, args, { cwd: repo, encoding: null, timeout: 30000 });
if (result.error) throw result.error;
fs.writeFileSync(path.join(destination, 'focused-stdout.raw'), result.stdout);
fs.writeFileSync(path.join(destination, 'focused-stderr.raw'), result.stderr);
const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'model.js')], { cwd: repo, encoding: null, timeout: 10000 });
if (syntax.error || syntax.status !== 0) throw new Error('RED must use a syntax-valid loadable stub.');
const observation = {
  cardId: 'A-S120', workerId: 'worker-A-S120', packet: 'SC-S120', phase,
  recordedAtUtc: new Date().toISOString(), node: process.version, command: [process.execPath, ...args],
  exitCode: result.status, signal: result.signal, syntaxExitCode: syntax.status,
  stdoutSha256: digest(result.stdout), stderrSha256: digest(result.stderr),
  behavioralAssertionObserved: /ERR_ASSERTION/.test(result.stdout.toString()),
  sources: {}
};
for (const file of ['model.js', 'app.js', 'index.html', 'styles.css', 'total-loss.feature', 'tests\\model.test.cjs', 'scripts\\browser.cjs']) {
  const bytes = fs.readFileSync(path.join(root, file));
  observation.sources[file] = { sha256: digest(bytes), bytes: bytes.length };
  if (phase === 'red') {
    const name = file === 'model.js' ? 'model.stub' : `${path.basename(file).replaceAll('.', '-')}.source`;
    fs.writeFileSync(path.join(destination, name), bytes);
  }
}
fs.writeFileSync(path.join(destination, 'focused.json'), `${JSON.stringify(observation, null, 2)}\n`);
console.log(JSON.stringify(observation, null, 2));
if (phase === 'red') {
  if (result.status !== 1 || !observation.behavioralAssertionObserved || /MODULE_NOT_FOUND|SyntaxError/.test(result.stdout.toString() + result.stderr.toString())) {
    throw new Error('RED was not a genuine behavioral assertion failure.');
  }
  const browser = spawnSync(process.execPath, [path.join(root, 'scripts', 'browser.cjs')], {
    cwd: repo, encoding: null, timeout: 90000, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '1' }
  });
  if (browser.error) throw browser.error;
  fs.writeFileSync(path.join(destination, 'browser-stdout.raw'), browser.stdout);
  fs.writeFileSync(path.join(destination, 'browser-stderr.raw'), browser.stderr);
  const browserResult = JSON.parse(browser.stdout.toString());
  const browserProof = {
    cardId: 'A-S120', phase: 'red', exitCode: browser.status, signal: browser.signal,
    assertionObserved: browserResult.failure?.code === 'ERR_ASSERTION',
    cleanupAwaited: browserResult.cleanupAwaited === true, captured: browserResult.captured,
    stdoutSha256: digest(browser.stdout), stderrSha256: digest(browser.stderr)
  };
  fs.writeFileSync(path.join(destination, 'browser.json'), `${JSON.stringify(browserProof, null, 2)}\n`);
  console.log(JSON.stringify(browserProof, null, 2));
  if (browser.status !== 1 || !browserProof.assertionObserved || !browserProof.cleanupAwaited) {
    throw new Error('Browser RED was not an actual assertion failure with awaited cleanup.');
  }
} else if (result.status !== 0) {
  process.exitCode = 1;
}
