'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest binds the precise source, frozen unit, packet, bounded exercise and limits', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual([manifest.cardId, manifest.sourceId, manifest.parentId, manifest.packet, manifest.kano, manifest.kanoUnit],
    ['A-S050', 'S050', 'D-S050', 'SC-S050', 'S', 'A-S050']);
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.entryPoint, 'learning/S050/index.html');
  assert.equal(manifest.bounds.fixedClients, 4);
  assert.equal(manifest.bounds.oldDependencies, 3);
  assert.equal(manifest.bounds.retainedAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.objective, /keep-alive.*routing-cookie.*admitted-work/);
  for (const file of ['index.html', 'README.md', 'retirement.feature']) {
    assert.ok(read(file).includes(manifest.requiredVisibleLabel));
  }
  assert.equal(manifest.testRuntime.productionNode24Certification, false);
  assert.ok(manifest.limits.some((limit) => /B-S050 and D-S050 remain uncompleted/.test(limit)));
});

test('local entry has restrictive CSP, only owned assets, no inline code and unique linked control IDs', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|javascript:/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['model.js', 'app.js']);
  assert.equal([...html.matchAll(/<script\b/g)].length, 2);
  assert.match(html, /href="styles.css"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes('reset'));
  assert.doesNotMatch(html, /\bname="reset"/);
  for (const match of html.matchAll(/<label for="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(read('styles.css'), /:focus-visible\s*\{[^}]*outline: 3px/);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|setInterval|setTimeout)\b|document\.cookie|localStorage|Math\.random|innerHTML|new Function|\beval\s*\(/);
  }
  assert.doesNotMatch(read('app.js'), /\bform\.reset\s*\(/);
});

test('browser global uses the same deterministic model without Node or a framework', () => {
  const context = vm.createContext({});
  new vm.Script(read('model.js'), { filename: 'model.js' }).runInContext(context);
  assert.equal(vm.runInContext('S050.createState().phase', context), 'ready');
  assert.equal(vm.runInContext("['route','resolve','retire'].reduce((s,a)=>S050.step(s,a),S050.createState()).result.outcome", context), 'success');
  assert.equal(vm.runInContext('Object.isFrozen(S050)', context), true);
});

test('all executable owned JavaScript passes Node syntax checks', () => {
  const files = ['model.js', 'app.js', 'capture.cjs', ...fs.readdirSync(path.join(root, 'tests')).filter((file) => /\.(?:js|cjs)$/.test(file)).map((file) => path.join('tests', file))];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, `${file}\n${result.stdout}${result.stderr}`);
  }
});
