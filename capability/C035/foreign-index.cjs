'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const schema = 'C035-foreign-index/1';
const ownedPrefix = 'capability/C035/';
const textFields = Object.freeze(['nameStatus', 'entries', 'flags', 'debug']);
const fields = Object.freeze(['paths', ...textFields]);
const maximumInputBytes = 65536;
const repositoryLocation = /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|PREFIX|NAMESPACE)$/i;

function fail(code, detail) {
  throw Object.assign(new Error(detail ? `${code}: ${detail}` : code), { code });
}
function requireRepository(repository) {
  if (typeof repository !== 'string' || !path.isAbsolute(repository) || repository.includes('\0')) {
    fail('FOREIGN_INDEX_REPOSITORY_REQUIRED');
  }
}
// Read-only Git access to exactly the named repository; inherited location variables cannot redirect it.
function git(repository, args) {
  requireRepository(repository);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !repositoryLocation.test(key)));
  try {
    return execFileSync('git', ['--no-pager', '--literal-pathspecs', ...args], {
      cwd: repository, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    fail('FOREIGN_INDEX_GIT_READ_FAILED', `${args[0]}: ${String(error.stderr || error.message).trim().slice(0, 200)}`);
  }
}
function stagedForeignPaths(repository) {
  return git(repository, ['diff', '--cached', '--no-renames', '--name-only', '-z'])
    .split('\0').filter((entry) => entry && !entry.startsWith(ownedPrefix)).sort();
}
function snapshot(repository) {
  const paths = stagedForeignPaths(repository);
  if (!paths.length) return { schema, paths, nameStatus: '', entries: '', flags: '', debug: '' };
  const scope = ['--', ...paths];
  return {
    schema, paths,
    nameStatus: git(repository, ['diff', '--cached', '--no-renames', '--name-status', ...scope]),
    entries: git(repository, ['ls-files', '--stage', ...scope]),
    flags: git(repository, ['ls-files', '-v', ...scope]),
    debug: git(repository, ['ls-files', '--debug', ...scope])
  };
}
function assertShape(value) {
  const keys = ['schema', ...fields];
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key)) ||
      value.schema !== schema || !Array.isArray(value.paths) || !value.paths.every((entry) => typeof entry === 'string') ||
      !textFields.every((key) => typeof value[key] === 'string')) fail('FOREIGN_INDEX_SNAPSHOT_SHAPE');
}
function compare(before, after) {
  assertShape(before);
  assertShape(after);
  const changed = fields.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
  return { preserved: changed.length === 0, changed };
}
function verify(before, repository) {
  assertShape(before);
  const after = snapshot(repository);
  return { ...compare(before, after), before, after };
}
// Closed CLI: exit 0 preserved/snapshot, 1 changed, 3 rejected. Nothing is staged, restored or written.
function run(args, input) {
  try {
    if (!(Array.isArray(args) && args.length === 2 && ['snapshot', 'verify'].includes(args[0]))) {
      fail('CLOSED_FOREIGN_INDEX_ARGUMENTS_REQUIRED');
    }
    const [command, repository] = args;
    if (command === 'snapshot') return { exitCode: 0, output: JSON.stringify(snapshot(repository)) };
    const text = typeof input === 'function' ? input() : input;
    if (Buffer.byteLength(text) > maximumInputBytes) fail('FOREIGN_INDEX_INPUT_BOUNDED');
    let before;
    try { before = JSON.parse(text); } catch { fail('FOREIGN_INDEX_JSON_REQUIRED'); }
    const verified = verify(before, repository);
    return { exitCode: verified.preserved ? 0 : 1, output: JSON.stringify(verified) };
  } catch (error) {
    return {
      exitCode: 3,
      output: JSON.stringify({
        schema: 'C035-foreign-index-rejection/1', valid: false, code: error.code || 'FOREIGN_INDEX_UNAVAILABLE',
        stagingPerformed: false, indexWritten: false
      })
    };
  }
}
if (require.main === module) {
  const { exitCode, output } = run(process.argv.slice(2), () => fs.readFileSync(0, 'utf8'));
  process.stdout.write(`${output}\n`);
  process.exitCode = exitCode;
}
module.exports = Object.freeze({ ownedPrefix, snapshot, compare, verify, run });
