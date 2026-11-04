'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const json = (relative) => JSON.parse(read(relative));
const source = json(path.join('evidence', 'source-seal.json'));
const manifest = json('manifest.json');
const gitBytes = (commit, gitObjectPath) => execFileSync('git', ['--no-pager', 'show', `${commit}:${gitObjectPath}`], { cwd: repo, encoding: null, maxBuffer: 4 * 1024 * 1024 });

function selected(name, bytes) {
  const text = bytes.toString('utf8');
  if (name === 'portable') {
    const start = text.indexOf('### Portable A-card lesson contract');
    const end = text.indexOf('## Concurrent pull and one-piece flow', start);
    assert.ok(start >= 0 && end > start);
    return Buffer.from(text.slice(start, end));
  }
  const prefixes = {
    readme: ['| S127 |', '- AKS rollout settings,'],
    backlog: ['| D-S127 |'],
    cards: ['| A-S127 |', '| B-S127 |'],
  }[name];
  return Buffer.concat(prefixes.map((prefix) => {
    const lines = text.split(/(?<=\n)/).filter((line) => line.startsWith(prefix));
    assert.equal(lines.length, 1);
    return Buffer.from(lines[0]);
  }));
}

test('exact README, D-S127, portable contract and A/B source rows remain separately sealed', () => {
  assert.equal(source.cardId, 'A-S127');
  assert.equal(source.kano, 'S');
  assert.equal(source.kanoUnit, 'A-S127');
  assert.equal(source.packet, 'SC-S127');
  assert.equal(source.sources.length, 4);
  for (const entry of source.sources) {
    const pinned = gitBytes(source.sourceCommit, entry.gitObjectPath);
    assert.equal(hash(pinned), entry.canonicalGitSourceSha256);
    assert.equal(hash(read(entry.raw.path)), entry.raw.sha256);
    assert.equal(hash(read(entry.git.path)), entry.git.sha256);
    assert.deepEqual(selected(entry.name, pinned), read(entry.git.path));
    assert.deepEqual(canonical(read(entry.raw.path)), read(entry.git.path));
    assert.deepEqual(canonical(selected(entry.name, fs.readFileSync(path.join(repo, entry.path)))), read(entry.git.path));
  }
});

test('source acceptance is quoted exactly, without completing native sibling or parent', () => {
  const backlog = read(path.join('evidence', 'raw', 'source-backlog.git.snapshot')).toString('utf8');
  const cards = read(path.join('evidence', 'raw', 'source-cards.git.snapshot')).toString('utf8');
  const readme = read(path.join('evidence', 'raw', 'source-readme.git.snapshot')).toString('utf8');
  assert.equal(manifest.sourceAcceptance, backlog.split('|')[4].trim());
  assert.equal(manifest.objective, cards.split('\n')[0].split('|')[4].trim());
  assert.ok(readme.includes(manifest.sourceRequiredBehavior));
  assert.match(readme, /voluntary eviction through the Eviction API, not arbitrary failure or every rollout operation/);
  assert.match(readme, /`PreStop` hook consumes part of the termination grace period/);
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S127');
  assert.equal(manifest.packet, 'SC-S127');
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.additionalKanoCredits, 0);
  const remainder = json('remainder.json');
  assert.equal(remainder.nativeRemainder, 'B-S127');
  assert.equal(remainder.originalNativeKanoUnit, 'B-S127');
  assert.equal(remainder.readiness, false);
  assert.equal(remainder.admittedToDo, false);
  assert.equal(remainder.additionalTestRepairProofRefinementCredits, 0);
  assert.equal(remainder.sourceAcceptance, manifest.sourceAcceptance);
});

test('published helper raw/canonical bytes are distinct and pinned, not the inactive prototype', () => {
  const helper = source.helper;
  assert.equal(helper.workingRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(helper.publishedCommit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(helper.canonicalGitSha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.equal(hash(gitBytes(helper.publishedCommit, 'testing/browser/isolated.cjs')), helper.canonicalGitSha256);
  const current = fs.readFileSync(path.join(repo, helper.path));
  assert.ok([helper.workingRawSha256, helper.canonicalGitSha256].includes(hash(current)));
  assert.equal(hash(canonical(current)), helper.canonicalGitSha256);
  assert.equal(manifest.verification.helperWorkingSha256, helper.workingRawSha256);
  assert.equal(manifest.verification.helperCanonicalGitSha256, helper.canonicalGitSha256);
});

test('narrow raw-byte attributes preserve proof without broad checkout rewrites', () => {
  assert.equal(canonical(read('.gitattributes')).toString('utf8'), 'evidence/raw/** -text whitespace=-blank-at-eol,-blank-at-eof,cr-at-eol\n');
  const attribute = execFileSync('git', ['check-attr', 'text', 'whitespace', '--', path.join('learning', 'S127', 'evidence', 'raw', 'red.tap.txt')], { cwd: repo, encoding: 'utf8' });
  assert.match(attribute, /text: unset/);
  assert.match(attribute, /whitespace: -blank-at-eol,-blank-at-eof,cr-at-eol/);
});

test('preserved loadable stub genuinely produces 0 where the original test expected 2', () => {
  const stage = json(path.join('evidence', 'raw', 'red-stage.json'));
  const tap = read(path.join('evidence', 'raw', 'red.tap.txt'));
  assert.equal(stage.exitCode, 1);
  assert.equal(stage.outputSha256, hash(tap));
  assert.match(tap.toString('utf8'), /0 !== 2/);
  assert.match(tap.toString('utf8'), /code: 'ERR_ASSERTION'/);
  assert.match(read(path.join('evidence', 'raw', 'red-test.snapshot')).toString('utf8'), /assert\.equal\(state\.result\.successfulTransitions, 2\)/);
  const module = { exports: {} };
  vm.runInNewContext(read(path.join('evidence', 'raw', 'red-model.snapshot')).toString('utf8'), { module }, { filename: 'preserved-red-model.snapshot' });
  const lesson = module.exports.createLesson();
  lesson.dispatch({ type: 'configure', settings: {} });
  lesson.dispatch({ type: 'observe' });
  lesson.dispatch({ type: 'rollout' });
  assert.equal(lesson.dispatch({ type: 'drain' }).result.successfulTransitions, 0);
  assert.match(read(path.join('evidence', 'raw', 'red-bdd.snapshot')).toString('utf8'), /Feature: A-S127/);
});

test('IaC N/A is explicitly recorded after behavioral RED and before implementation', () => {
  const red = json(path.join('evidence', 'raw', 'red-stage.json'));
  const decision = json(path.join('evidence', 'raw', 'iac-decision.json'));
  assert.equal(decision.applicability, 'N/A');
  assert.equal(decision.implementationNotStarted, true);
  assert.equal(decision.approvalsInferred, false);
  assert.equal(decision.additionalCredits, 0);
  assert.ok(Date.parse(red.capturedAtUtc) <= Date.parse(decision.decidedAtUtc));
  assert.match(manifest.iac, /^N\/A - resource-free/);
});

test('lesson source assets are canonically sealed; preserved raw proof is checked byte-for-byte', () => {
  const seal = json(path.join('evidence', 'integrity-seal.json'));
  assert.equal(seal.cardId, 'A-S127');
  assert.ok(seal.files.length >= 20);
  for (const entry of seal.files) {
    const bytes = read(entry.path);
    assert.equal(hash(entry.raw ? bytes : canonical(bytes)), entry.sha256, entry.path);
    if (entry.raw) assert.equal(hash(bytes), entry.workingRawSha256, entry.path);
  }
  for (const required of ['model.js', 'app.js', 'index.html', 'style.css', 'capture.cjs', 'manifest.json', '.gitattributes', 'rolling.feature', 'USAGE.txt', 'remainder.json']) {
    assert.ok(seal.files.some((entry) => entry.path === required), required);
  }
});

test('portable surface has exact banner, restrictive CSP, local assets and no inline handlers', () => {
  const html = read('index.html').toString('utf8');
  assert.ok(html.includes(manifest.banner));
  assert.match(html, /Content-Security-Policy/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|<base\b|https?:\/\/|name=["']reset["']/i);
  assert.equal((html.match(/<script /g) || []).length, 2);
  assert.match(read('app.js').toString('utf8'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  for (const asset of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(asset).toString('utf8'), /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bWorker\s*\(|\blocalStorage\b|\bsessionStorage\b|\beval\s*\(/);
  }
});
