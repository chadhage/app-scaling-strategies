'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..', '..');
const mode = process.argv[2];
const commit = 'ab1931e2d336ab1d93aa0b133c3e8c1fd5c1ab95';
if (!['lf', 'crlf'].includes(mode)) throw new Error('U055 fresh mode must be lf or crlf.');
const supplied = process.env.C026_U055_SCRATCH;
if (!supplied || !/^\.git\\kanban-orchestrator\\execution-[A-Za-z0-9-]+\\scratch\\U055$/.test(supplied)) {
  throw new Error('C026_U055_SCRATCH must name the caller-owned repository-relative U055 scratch root.');
}
const target = path.join(repository, supplied, `fresh-${mode}`);
if (fs.existsSync(target)) throw new Error('U055 fresh target already exists; preserve that attempt and use a distinct owned target.');
fs.mkdirSync(target, { recursive: true });
const archive = path.join(target, 'accepted.tar');
const scopes = ['capability\\C026', 'capability\\C001', '.docs\\wiki\\flow-state.json'];
fs.writeFileSync(archive, execFileSync('git', ['--no-pager', 'archive', '--format=tar', commit, ...scopes], { cwd: repository, maxBuffer: 64 * 1024 * 1024 }), { flag: 'wx' });
try {
  execFileSync('tar', ['-xf', archive, '-C', target], { windowsHide: true });
  const tree = execFileSync('git', ['--no-pager', 'ls-tree', '-r', commit, '--', ...scopes], { cwd: repository, encoding: 'utf8' });
  let committedFiles = 0;
  for (const line of tree.trim().split('\n')) {
    const match = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!match) throw new Error('U055 expected committed file blobs only.');
    const bytes = fs.readFileSync(path.join(target, ...match[2].split('/')));
    const hash = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    if (hash !== match[1]) throw new Error('U055 extracted bytes differ from their accepted Git blob.');
    committedFiles += 1;
  }
  fs.cpSync(path.join(repository, 'capability', 'C026'), path.join(target, 'capability', 'C026'), { recursive: true });
  let converted = 0;
  if (mode === 'crlf') {
    for (const name of ['approved-contract.js', 'contract-guard.js']) {
      const file = path.join(target, 'capability', 'C001', name);
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
      fs.writeFileSync(file, text);
      converted += 1;
    }
  }
  delete process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_V8_COVERAGE;
  const result = spawnSync(process.execPath, ['capability\\C026\\tests\\u055-suite.cjs', 'capability\\C026\\tests\\*.test.cjs'], {
    cwd: target, env: { ...process.env }, windowsHide: true, timeout: 1800000, maxBuffer: 64 * 1024 * 1024
  });
  process.stdout.write(`U055 fresh ${mode}: accepted Git archive ${commit}, ${committedFiles} exact blobs; current C026 overlay; ${converted} C001 imports converted; C026 -text bytes preserved.\n`);
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exitCode = result.status ?? 2;
} finally {
  fs.unlinkSync(archive);
}
