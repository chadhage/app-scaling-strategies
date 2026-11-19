'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { workingSourcePath } = require('./source-path.cjs');

const root = path.resolve(__dirname, '..');
const meta = path.join(root, 'meta');
const excluded = new Set(['.git', '.coverage-v8', 'node_modules', 'evidence', 'private', 'demo-output']);

function* documents(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* documents(file);
    else if (entry.isFile() && /\.(?:md|html)$/.test(entry.name)) yield file;
  }
}

test('planning navigation resolves under meta while frozen source links remain usable', () => {
  let checked = 0;
  for (const file of documents(root)) {
    const text = fs.readFileSync(file, 'utf8');
    const links = text.matchAll(/\bhref=["']([^"']+)["']|\[[^\]\r\n]*\]\(([^)\s]+)\)/g);
    for (const match of links) {
      let href = match[1] || match[2];
      if (href.startsWith('#')) continue;
      if (/^https?:/.test(href)) {
        const current = 'https://github.com/chadhage/app-scaling-strategies/blob/main/';
        if (!href.startsWith(current)) continue;
        href = path.join(root, href.slice(current.length));
      }
      const target = path.resolve(path.dirname(file), decodeURIComponent(href.split(/[?#]/)[0]));
      if ((file === path.join(root, 'learning', 'S001', 'index.html') ||
           file === path.join(meta, 'README.md')) &&
          target === path.join(root, '.docs', 'wiki', 'backlog.md')) {
        const pointer = fs.readFileSync(target, 'utf8');
        assert.match(pointer, /\]\(\.\.\/\.\.\/meta\/wiki\/backlog\.md\)/);
        checked += 1;
        continue;
      }
      assert.doesNotMatch(href, /\.docs[/\\]wiki|\.azure[/\\]deployment-plan\.md/,
        `${path.relative(root, file)}: ${href}`);
      const relative = path.relative(meta, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
      assert.ok(fs.statSync(target).isFile(), `${path.relative(root, file)}: ${href}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'Current planning navigation must remain available.');
});

test('the relocated execution ledger points to its current planning inventory', () => {
  const state = JSON.parse(fs.readFileSync(path.join(meta, 'wiki', 'flow-state.json'), 'utf8'));
  const inventory = path.resolve(root, state.sourceInventory.path);
  assert.ok(inventory.startsWith(meta + path.sep));
  assert.match(fs.readFileSync(inventory, 'utf8'), /^# Demo Harness Kanban\r?$/m);
});

test('C005 checks current canonical documents using POSIX paths', () => {
  const virtualRoot = path.posix.join(path.posix.sep, 'repo');
  const documents = new Map([
    [path.posix.join(virtualRoot, 'README.md'), 'readme'],
    [path.posix.join(virtualRoot, 'meta', 'wiki', 'backlog.md'), 'backlog']
  ]);
  const sourcePathModule = { exports: {} };
  const requirePosix = name => {
    if (name === 'node:path') return path.posix;
    if (name === 'node:fs') return {
      readFileSync(file) {
        if (!documents.has(file)) throw new Error(`Unexpected canonical path: ${file}`);
        return documents.get(file);
      }
    };
    if (name === '../../testing/source-path.cjs') return sourcePathModule.exports;
    return require(name);
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'source-path.cjs'), 'utf8'),
    { module: sourcePathModule, require: requirePosix });
  const catalogModule = { exports: {} };
  const catalogSource = fs.readFileSync(path.join(root, 'capability', 'C005', 'catalog-source.cjs'), 'utf8');
  vm.runInNewContext(`${catalogSource}\nmodule.exports.checkCurrentCanonical = checkCurrentCanonical;`, {
    module: catalogModule, require: requirePosix,
    __dirname: path.posix.join(virtualRoot, 'capability', 'C005')
  });
  catalogModule.exports.checkCurrentCanonical({ readme: 'readme', backlog: 'backlog' });
});

test('recorded source labels still locate working documents in either path-separator form', () => {
  for (const [recorded, current] of [
    ['.docs/wiki/backlog.md', ['wiki', 'backlog.md']],
    ['.docs\\wiki\\kanban.md', ['wiki', 'kanban.md']],
    ['.azure/deployment-plan.md', ['deployment-plan.md']],
    ['meta\\wiki\\flow-state.json', ['wiki', 'flow-state.json']]
  ]) {
    assert.deepEqual(fs.readFileSync(workingSourcePath(root, recorded)),
      fs.readFileSync(path.join(meta, ...current)));
  }
  assert.throws(() => fs.readFileSync(workingSourcePath(root, '.docs/wiki/missing.md')),
    { code: 'ENOENT' });
});
