'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { generate } = require('./mutants.cjs');

test('G9 the actual generator includes canon regex classes, bounds, alternatives and global base64url flags', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'canon.cjs'), 'utf8');
  const generated = generate(source, 'canon.cjs');
  const regex = generated.filter((item) => item.kind.startsWith('regex '));
  assert.ok(regex.length > 50, 'canon regular expressions actually enter the production generator');
  for (const member of ['a-f', 'A-F']) assert.ok(regex.some((item) => item.kind === `regex class item ${member} removed`), member);
  assert.ok(regex.some((item) => item.kind === 'regex flag g removed' && source.slice(0, item.start).includes('exact.add(text.replace')), 'global base64url conversion is generated');
  assert.ok(regex.some((item) => item.kind.startsWith('regex quantifier')), 'regex bounds enter the generator');
});

test('G10 the asset test kills an HTML media type mutant by its independent literal expectation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  const original = "'text/html; charset=utf-8'";
  const start = source.indexOf(original);
  assert.ok(start >= 0);
  const env = { ...process.env, C014_MUTANT: JSON.stringify({ file: 'server.cjs', start, end: start + original.length, original, replacement: "'text/plain'" }) };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const run = spawnSync(process.execPath, ['--require', path.join(__dirname, 'mutate-preload.cjs'), '--test', '--test-name-pattern=the three assets are served BYTE FOR BYTE', path.join(__dirname, 'server.test.cjs')],
    { env, cwd: path.join(__dirname, '..', '..', '..'), encoding: 'utf8', windowsHide: true, timeout: 90000 });
  assert.equal(run.error, undefined, 'the behavioral probe completed naturally');
  assert.notEqual(run.status, 0, 'a wrong content type cannot survive the asset oracle');
  assert.match(run.stdout, /not ok \d+ - the three assets are served BYTE FOR BYTE/);
  assert.match(run.stdout, /ERR_ASSERTION/);
});

function callbacks(file) {
  const registered = [];
  const fakeTest = (name, options, body) => registered.push({ name, body: typeof options === 'function' ? options : body });
  const realRequire = require('node:module').createRequire(file);
  const wrapped = (id) => {
    if (id === 'node:test') return fakeTest;
    if (id === 'node:fs') return { ...fs, existsSync: (name) => String(name).endsWith('FRESH-COPY') || fs.existsSync(name) };
    if (id === 'node:child_process') return { ...require('node:child_process'), execFileSync: () => { throw new Error('fixture has no Git history'); } };
    return realRequire(id);
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__dirname', '__filename', fs.readFileSync(file, 'utf8'))(wrapped, module, module.exports, path.dirname(file), file);
  return registered;
}

test('G7 the four environment-dependent callbacks explicitly skip with a named reason instead of passing without assertions', () => {
  const prefixes = {
    'integrity.test.cjs': ['the REDs of the third fix ran', 'the fresh-checkout captures:', 'the seal pins the final bytes:'],
    'readme.test.cjs': ['the fresh-checkout lines of the README']
  };
  for (const [file, names] of Object.entries(prefixes)) {
    const registered = callbacks(path.join(__dirname, file));
    for (const prefix of names) {
      const callback = registered.find((entry) => entry.name.startsWith(prefix));
      assert.ok(callback, prefix);
      let reason;
      callback.body({ skip: (message) => { reason = message; } });
      assert.ok(typeof reason === 'string' && reason.length > 15, `${prefix}: a missing prerequisite is a named skip`);
    }
  }
});
