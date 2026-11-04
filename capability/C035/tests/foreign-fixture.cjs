'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const namespace = path.resolve(__dirname, '..');
const foreignPath = 'capability/C048/evidence/red/replay.cjs.txt';
const otherForeignPath = 'capability/C049/notes.txt';
const ownPath = 'capability/C035/own.txt';
const whitespace = 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol';
const fallbackRoot = path.join(namespace, 'tests', 'scratch');

function scratchRoot() {
  const configured = process.env.C035_FIXTURE_ROOT;
  if (configured !== undefined) {
    assert.ok(path.isAbsolute(configured) && fs.statSync(configured).isDirectory(),
      'C035_FIXTURE_ROOT must name an existing absolute directory.');
    return configured;
  }
  fs.mkdirSync(fallbackRoot, { recursive: true });
  return fallbackRoot;
}
function hermeticEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^GIT_/i.test(key)) env[key] = value;
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0' };
}
function createFixture() {
  const directory = path.join(scratchRoot(), `foreign-${randomUUID()}`);
  fs.mkdirSync(directory);
  const env = hermeticEnvironment();
  const prefix = ['--no-pager', '-c', 'user.name=C035 fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'commit.gpgsign=false'];
  const git = (...args) => execFileSync('git', [...prefix, ...args], {
    cwd: directory, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4194304,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const write = (relative, text) => {
    const file = path.join(directory, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const fixture = {
    directory, env, git, write, foreignPath, otherForeignPath, ownPath,
    seed() {
      git('init', '-q', '-b', 'main');
      assert.equal(path.resolve(git('rev-parse', '--show-toplevel').trim()).toLowerCase(), path.resolve(directory).toLowerCase(),
        'The fixture must be its own repository, never the enclosing live one.');
      const origins = git('config', '--list', '--show-origin').split('\n').filter(Boolean).map((line) => line.split('\t')[0]);
      assert.ok(origins.every((origin) => origin === 'file:.git/config' || origin === 'command line:'),
        `No system or global Git configuration may reach the fixture: ${origins.join(', ')}`);
      write(ownPath, 'own base\n');
      write(foreignPath, 'foreign base\n');
      git('add', '--', '.');
      git('commit', '-q', '-m', 'base');
      return fixture;
    },
    stageForeign(text = 'foreign staged\n', relative = foreignPath) {
      write(relative, text);
      git('add', '--', relative);
      return git('rev-parse', `:${relative}`).trim();
    },
    changeOwn() {
      write(ownPath, 'own changed\n');
      write('capability/C035/new.txt', 'own new\n');
    },
    publishOwn(message = '[C035][D] fixture publication') {
      git('add', '--', 'capability/C035');
      git('-c', whitespace, 'diff', '--cached', '--check', '--', 'capability/C035');
      git('commit', '-q', '--only', '-m', message, '--', 'capability/C035');
    },
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      assert.equal(fs.existsSync(directory), false, 'The throwaway fixture repository must be removed.');
      const parent = path.dirname(directory);
      if (parent === fallbackRoot && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    }
  };
  return fixture;
}
async function withFixture(body) {
  const fixture = createFixture();
  try { return await body(fixture.seed()); } finally { fixture.cleanup(); }
}
module.exports = Object.freeze({ withFixture, createFixture, scratchRoot, hermeticEnvironment, foreignPath, otherForeignPath, ownPath });
