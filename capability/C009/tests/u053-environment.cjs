'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

function childEnvironment(inherited = process.env, additions = {}) {
  const env = { ...inherited };
  for (const key of Object.keys(env)) {
    if (/^GIT_/i.test(key) || /^C0(?:09|10|11|14|22)_(?:SUBJECT_DIR|GIT_REPOSITORY)$/.test(key) ||
        ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C009_IMPORTS_PIN_FILE', 'U053_SUBJECT_DIR', 'CAPTURE_BROWSER_EVIDENCE'].includes(key)) delete env[key];
  }
  return { ...env, NODE_V8_COVERAGE: '', ...additions };
}

function noRepository(directory, env) {
  assert.equal(fs.existsSync(path.join(directory, '.git')), false, 'a bare archive has no .git entry');
  const result = spawnSync('git', ['--no-pager', 'rev-parse', '--absolute-git-dir'], {
    cwd: directory, env, encoding: 'utf8', windowsHide: true, timeout: 20000
  });
  assert.equal(result.error, undefined, 'Git itself executed; missing Git is not missing repository history');
  assert.equal(result.status, 128, 'no repository can be discovered from the bare archive');
  assert.equal(result.stdout, '', 'the bare case did not discover a parent .git');
  assert.match(result.stderr, /not a git repository/i, 'a real no-repository diagnostic, not another Git failure');
  return { hasRootDotGit: false, gitExitCode: result.status, gitStdoutEmpty: true, noRepositoryDiagnostic: true };
}

function withBareRoot(base, operation) {
  const parent = path.resolve(base);
  const physical = path.join(parent, `bare-${randomUUID()}`);
  assert.equal(fs.existsSync(physical), false, 'never adopt an existing bare fixture');
  fs.mkdirSync(physical, { recursive: true });
  let drive;
  for (const letter of 'YXWVUTSRQPONMLKJIHG') {
    if (!fs.existsSync(`${letter}:\\`)) { drive = `${letter}:`; break; }
  }
  assert.ok(drive, 'an unused owned drive-root alias is available');
  let mapped = false;
  let answer;
  let probe;
  try {
    execFileSync('subst.exe', [drive, physical], { windowsHide: true });
    mapped = true;
    const root = `${drive}\\`;
    const env = childEnvironment(process.env, { U053_SCRATCH_ROOT: parent, GIT_CEILING_DIRECTORIES: parent });
    probe = noRepository(root, env);
    answer = operation({ root, physical, env, probe });
  } finally {
    if (mapped) {
      const mappings = execFileSync('subst.exe', [], { encoding: 'utf8', windowsHide: true });
      assert.ok(mappings.toLowerCase().includes(`${drive}\\: => ${physical}`.toLowerCase()), 'release only the exact alias this fixture created');
      execFileSync('subst.exe', [drive, '/d'], { windowsHide: true });
      assert.equal(fs.existsSync(`${drive}\\`), false, 'the owned bare alias was removed');
    }
    fs.rmSync(physical, { recursive: true, force: true });
    assert.equal(fs.existsSync(physical), false, 'the owned bare fixture was removed');
  }
  return { ...answer, bareContext: { ...probe, method: 'owned drive root; explicit physical-parent discovery ceiling after clearing inherited Git bindings' },
    bareCleanup: { aliasRemoved: true, fixtureRemoved: true } };
}

module.exports = Object.freeze({ childEnvironment, noRepository, withBareRoot });
