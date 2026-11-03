'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('.\\provenance.cjs');
const model = require('..\\model.js');
const html = read('index.html').toString();
const app = read('app.js').toString();
const css = read('styles.css').toString();
const manifest = JSON.parse(read('manifest.json'));

test('standalone manifest declares exact owned source, contract, synthetic mode and limitations', () => {
  for (const [key, value] of Object.entries({
    cardId: 'A-S090', workerId: 'worker-A-S090', sourceId: 'S090', parentId: 'D-S090',
    siblingId: 'B-S090', kano: 'S', kanoUnit: 'A-S090', packet: 'SC-S090',
    entryGate: 'SOURCE', entry: 'index.html', mode: 'synthetic',
    objective: 'Attempt early retirement; unresolved users/work/retention must reject it.',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    managementCalls: false, credentials: false, nativeAcceptanceCompleted: false,
  })) assert.equal(manifest[key], value, key);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length > 0);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /Rejection is not a completed migration/);
  assert.match(html, /No native drain, retention, retirement, production Node\.js 24/);
});

test('static form values match the model allowlists, labels are unique and reset is not shadowed', () => {
  const selectValues = (id) => [...html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1]
    .matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(selectValues('fixture'), Object.keys(model.FIXTURES));
  assert.deepEqual(selectValues('action'), model.ACTIONS);
  assert.deepEqual(selectValues('prediction'), ['', ...model.OUTCOMES]);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const id of ['fixture', 'action', 'prediction']) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const id of [...app.matchAll(/byId\('([^']+)'\)/g)].map((match) => match[1])) assert.ok(ids.includes(id), id);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /:focus-visible/);
  assert.match(app, /form\.reset\(\)/);
});

test('CSP has no unsafe exemptions and assets/lesson code perform no real operations', () => {
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'/);
  for (const directive of ['connect-src', 'object-src', 'base-uri', 'form-action', 'frame-src', 'worker-src']) {
    assert.ok(html.includes(`${directive} 'none'`), directive);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\/|<style\b|\bon\w+=|style=/i);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['theme.js', 'model.js', 'app.js']);
  for (const file of [...scripts, 'styles.css']) assert.ok(read(file).length > 0);
  for (const file of ['model.js', 'app.js', 'theme.js']) {
    assert.doesNotMatch(read(file).toString(),
      /\b(?:fetch|XMLHttpRequest|WebSocket|Worker|eval|exec|spawn|unlink|rmSync|writeFile|setInterval|setTimeout)\s*\(|innerHTML|localStorage|sessionStorage|document\.cookie/);
  }
  assert.match(app, /textContent/);
  assert.match(app, /event\.preventDefault\(\)/);
});

test('model loads as a browser global without CommonJS and remains deterministic', () => {
  const sandbox = {};
  new vm.Script(read('model.js').toString()).runInNewContext(sandbox);
  assert.equal(typeof sandbox.S090Model.createLesson, 'function');
  const a = sandbox.S090Model.createLesson();
  const b = sandbox.S090Model.createLesson();
  a.begin('all-dependencies');
  b.begin('all-dependencies');
  a.act('attempt-retirement');
  b.act('attempt-retirement');
  assert.deepEqual(JSON.parse(JSON.stringify(a.snapshot())), JSON.parse(JSON.stringify(b.snapshot())));
});

test('theme runs first, uses the required palette and colors are tokens outside theme definitions', () => {
  assert.ok(html.indexOf('src="theme.js"') < html.indexOf('src="model.js"'));
  assert.match(read('theme.js').toString(), /clawpilotTheme/);
  assert.match(read('theme.js').toString(), /prefers-color-scheme: dark/);
  assert.match(css, /--cp-bg: #f7f4ef/);
  assert.match(css, /--cp-bg: #3d3b3a/);
  assert.match(css, /"Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif/);
  assert.doesNotMatch(css.slice(css.indexOf('* {')), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
});
