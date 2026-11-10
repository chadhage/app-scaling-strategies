'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const authority = require('./u053-authority.cjs');
const suite = require('./u053-suite.cjs');
const { childEnvironment, noRepository, withBareRoot } = require('./u053-environment.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');

function runFresh(mode) {
  assert.ok(['lf', 'crlf', 'bare'].includes(mode));
  const base = process.env.U053_SCRATCH_ROOT || path.join(root, 'tests', '.u053-scratch');
  const answer = withBareRoot(base, ({ root: directory, env }) => {
    const archiveEnv = childEnvironment();
    const archive = execFileSync('git', ['--no-pager', '-c', 'core.autocrlf=false', 'archive', '--format=tar',
      'f95cc52a29cf643fd443b80e5c0b112556feb548', 'capability/C009'], {
      cwd: repository, env: archiveEnv, windowsHide: true, timeout: 120000, maxBuffer: 128 * 1024 * 1024
    });
    const tar = path.join(directory, 'accepted.tar');
    fs.writeFileSync(tar, archive, { flag: 'wx' });
    execFileSync('tar', ['-xf', tar, '-C', directory], { env: archiveEnv, windowsHide: true, timeout: 120000 });
    fs.unlinkSync(tar);
    const chain = authority.readCurrentAuthority(root);
    for (const entry of chain.catalog.production) assert.equal(authority.sha(fs.readFileSync(path.join(directory, entry.path))), entry.gitCanonicalSha256,
      'fresh archive really contains exact LF accepted Git production blobs');
    fs.cpSync(root, path.join(directory, 'capability', 'C009'), { recursive: true, force: true,
      filter: (file) => !/(?:^|\\)\.u053-scratch(?:\\|$)/.test(file.slice(root.length)) });
    for (const relative of ['capability\\C001', 'capability\\C010', 'capability\\C011', 'capability\\C014', 'capability\\C020',
      'capability\\C022', 'testing', '.docs\\wiki', 'README.md']) {
      const source = path.join(repository, relative);
      fs.mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
      fs.cpSync(source, path.join(directory, relative), { recursive: true, force: false, errorOnExist: true,
        filter: (file) => !/(?:^|\\)(?:scratch|\.u053-scratch|node_modules)(?:\\|$)/.test(file.slice(source.length)) });
    }
    for (const namespace of ['C009', 'C001']) {
      const target = path.join(directory, 'capability', namespace);
      for (const relative of fs.readdirSync(target, { recursive: true }).filter((file) => !file.startsWith('evidence\\') &&
          fs.lstatSync(path.join(target, file)).isFile())) {
        const file = path.join(target, relative);
        const bytes = authority.lf(fs.readFileSync(file));
        fs.writeFileSync(file, mode === 'crlf' ? Buffer.from(bytes.toString('latin1').replace(/\n/g, '\r\n'), 'latin1') : bytes);
      }
    }
    if (mode === 'bare') noRepository(directory, env);
    else {
      const gitDir = execFileSync('git', ['--no-pager', 'rev-parse', '--absolute-git-dir'],
        { cwd: repository, env: archiveEnv, encoding: 'utf8', windowsHide: true }).trim();
      fs.writeFileSync(path.join(directory, '.git'), `gitdir: ${gitDir}\n`, { flag: 'wx' });
    }
    const result = spawnSync(process.execPath, suite.argumentsFor('suite', undefined, path.join(directory, 'capability', 'C009')),
      { cwd: directory, env, windowsHide: true, timeout: 2400000, maxBuffer: 256 * 1024 * 1024 });
    process.stdout.write(result.stdout || Buffer.alloc(0));
    process.stderr.write(result.stderr || Buffer.alloc(0));
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `complete ${mode} namespace`);
    const text = result.stdout.toString('utf8');
    const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map((key) => [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1])]));
    assert.equal(summary.fail, 0);
    assert.equal(summary.cancelled, 0);
    assert.equal(summary.skipped, mode === 'bare' ? 2 : 0);
    if (mode === 'bare') noRepository(directory, env);
    return { mode, source: 'actual accepted f95 git archive with autocrlf=false plus exact owned current overlay; evidence remains raw',
      summary, testFiles: suite.TESTS.length, finalTip: chain.tip, production: chain.catalog.production };
  });
  if (mode !== 'bare') {
    answer.initialEmptyFixtureContext = answer.bareContext;
    delete answer.bareContext;
  }
  if (!process.env.U053_SCRATCH_ROOT && fs.existsSync(base) && !fs.readdirSync(base).length) fs.rmdirSync(base);
  return answer;
}

if (require.main === module) console.log(`U053 FRESH ${JSON.stringify(runFresh(process.argv[2]))}`);
module.exports = Object.freeze({ runFresh });
