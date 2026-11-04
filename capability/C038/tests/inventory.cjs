'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash } = require('../sources.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
function inventory(options = {}) {
  const rows = [];
  function walk(directory) {
    assert.equal(fs.realpathSync(directory), directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (['publication.json', 'published-report.json'].includes(relative) ||
          relative === path.join('tests', 'scratch')) continue;
      if (options.sourcesOnly && (relative === 'evidence-index.json' || relative === path.join('evidence', 'raw'))) continue;
      if (options.excludeDirectory && file === options.excludeDirectory) continue;
      assert.equal(entry.isSymbolicLink(), false);
      const stat = fs.lstatSync(file);
      if (entry.isDirectory()) walk(file);
      else {
        assert.ok(stat.isFile() && stat.nlink === 1);
        const bytes = fs.readFileSync(file);
        const row = { path: relative, rawSha256: hash(bytes), bytes: bytes.length };
        if (options.gitClean) {
          row.crlfToLfSha256 = hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
          row.gitCleanObjectId = execFileSync('git', ['--no-pager', 'hash-object',
            `--path=${path.relative(repository, file)}`, '--stdin'], {
            cwd: repository, input: bytes, windowsHide: true, timeout: 15000,
            encoding: 'ascii', maxBuffer: 65536, stdio: ['pipe', 'pipe', 'pipe']
          }).trim();
          assert.match(row.gitCleanObjectId, /^[0-9a-f]{40}$/);
        }
        rows.push(row);
      }
    }
  }
  walk(root);
  return rows;
}
module.exports = Object.freeze({ root, repository, inventory, hash });
