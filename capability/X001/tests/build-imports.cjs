'use strict';

// Writes imports.json: raw, CRLF-to-LF and accepted-git-blob SHA-256 of every file of another namespace that this namespace loads
// or reads (the closure is MEASURED from require.cache, not typed by hand). Read-only toward the other namespaces. The accepted
// blob of a published tag of the file's card is the anchor (L-0116): a file whose bytes agree with no tagged blob is refused.
// Run after saved.js exists:  node capability\X001\tests\build-imports.cjs [--force]
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
const bundle = 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116';

function closure() {
  require('..\\..\\C044\\run.cjs');
  require('..\\..\\C044\\reducer.js');
  require('..\\..\\C034\\trace.js');
  const loaded = Object.keys(require.cache).map((file) => path.relative(repository, file))
    .filter((relative) => /^capability\\C\d{3}\\/.test(relative));
  return [...new Set([...loaded, `capability\\C034\\evidence\\raw\\${bundle}\\bundle.json`])].sort();
}

function anchor(card, relative, bytes) {
  const tags = git('tag', '--list', `kanban/${card}/*`).toString().split(/\r?\n/).filter(Boolean)
    .map((tag) => ({ tag, commit: git('rev-parse', `${tag}^{commit}`).toString().trim() }))
    .map((entry) => ({ ...entry, time: Number(git('log', '-1', '--format=%ct', entry.commit).toString()) })).sort((a, b) => b.time - a.time);
  for (const entry of tags) {
    let blob;
    try { blob = git('cat-file', 'blob', `${entry.commit}:${relative.replaceAll('\\', '/')}`); } catch { continue; }
    if ([hash(bytes), hash(normalize(bytes))].includes(hash(blob))) return { commit: entry.commit, tag: entry.tag, acceptedGitSha256: hash(blob) };
  }
  throw new Error(`${relative} agrees with no tagged blob of ${card}`);
}

function build() {
  const dependencies = closure().map((relative) => {
    const bytes = fs.readFileSync(path.join(repository, relative));
    const card = /^capability\\(C\d{3})\\/.exec(relative)[1];
    return { card, path: relative, rawSha256: hash(bytes), crlfToLfSha256: hash(normalize(bytes)), ...anchor(card, relative, bytes) };
  });
  const own = [{ path: 'capability\\X001\\saved.js', rawSha256: hash(fs.readFileSync(path.join(root, 'saved.js'))), generatedBy: 'tests\\build-saved.cjs' }];
  return { schema: 'X001-source-pins/1', acceptedDecoderBundle: bundle, dependencies, own };
}

if (require.main === module) {
  const target = path.join(root, 'imports.json');
  if (fs.existsSync(target) && !process.argv.includes('--force')) throw new Error('imports.json exists; pass --force to rebuild');
  const pins = build();
  fs.writeFileSync(target, `${JSON.stringify(pins, null, 2)}\n`);
  console.log(`wrote ${pins.dependencies.length} dependency pins and ${pins.own.length} own pin`);
}
module.exports = Object.freeze({ build, closure, anchor, hash, normalize });
