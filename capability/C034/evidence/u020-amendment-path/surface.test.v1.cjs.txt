'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash, pins } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('static trace picker is semantic, keyboard reachable, CSP restricted and explicitly historical', () => {
  const html = read('index.html');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /Not a live disk read, network run or migration/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'",
    "form-action 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'"]) assert.ok(html.includes(directive));
  for (const id of ['trace', 'candidate', 'inspect', 'inspect-copy', 'load-copy', 'reset', 'status',
    'error', 'events', 'originals', 'context', 'source', 'inspection-history']) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)|\bon[a-z]+\s*=|<form|<iframe|<base\b/i);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(read('style.css'), /:focus-visible/);
  assert.match(read('page.js'), /textContent/);
  assert.doesNotMatch(read('page.js'), /innerHTML|fetch\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|createJourney|\.persist\(/);
});

test('browser script uses the saved evidence file and unchanged read-only C020/C033 libraries only', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['../C020/contract.js', '../C020/inspector.js', '../C033/journey.js',
    'evidence/raw/trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116/bundle.js', 'trace.js', 'page.js']);
  for (const relative of scripts) {
    const file = path.resolve(root, ...relative.split('/'));
    assert.equal(fs.lstatSync(file).isFile(), true);
  }
  assert.match(read('historical.cjs'), /restore\('synthetic-restart-v1', 'synthetic-run-001'\)/);
  assert.doesNotMatch(read('historical.cjs'), /persist\(|writeFile|mkdir|rename|unlink|createServer/);
});

test('exact approved publisher still retains C034 S, closed paths/Admin and remote-before-stage CRLF-aware guards', () => {
  const bytes = fs.readFileSync(path.join(repository, '.git', 'kanban-orchestrator', 'publish.ps1'));
  assert.equal(hash(bytes), pins.publisherRawSha256);
  const source = bytes.toString('utf8');
  assert.match(source, /C034='S'/);
  assert.match(source, /Not an owned card path/);
  assert.match(source, /Not a controller-owned path/);
  assert.match(source, /Publication requires checked-out main/);
  assert.match(source, /Main must already equal remote before staging/);
  assert.match(source, /core\.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/);
  assert.ok(source.indexOf('$head -ne $remoteBeforeCommit') < source.indexOf("Run-Git (@('add'"));
  assert.match(source, /push','--atomic'/);
  assert.match(source, /Co-authored-by: Copilot/);
  assert.equal(read('.gitattributes').trim(), '* -text');
});

test('state reads use the exact named mutex, close ReadAllText handles, and release/dispose even on failure', () => {
  const source = read('read-gates.ps1');
  assert.match(source, /Local\\AppScalingStrategies_KanbanState_v1/);
  assert.match(source, /\[IO\.File\]::ReadAllText/);
  assert.ok(source.indexOf('ReadAllText') > source.indexOf('$mutex.WaitOne'));
  assert.match(source, /finally\s*\{[\s\S]*ReleaseMutex\(\)[\s\S]*Dispose\(\)/);
  assert.doesNotMatch(source, /WriteAllText|Set-Content|Out-File|ExecutionPolicy|Bypass/i);
});
