'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const lesson = require('..\\model.js');
const { root, repo, sha, read, json, raw } = require('.\\support.cjs');
const banner = 'Training rehearsal - synthetic data - not a live Azure result';
const normalize = bytes => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

test('manifest preserves exact A-S106 objective, original packet/unit and incomplete native parent', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.sourceId, 'S106');
  assert.equal(manifest.cardId, 'A-S106');
  assert.equal(manifest.parentId, 'D-S106');
  assert.equal(manifest.packet, 'SC-S106');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S106');
  assert.equal(manifest.owner, 'worker-A-S106');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.equal(manifest.objective, 'Compare public and private probes; public success cannot certify a private dependency path.');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.banner, banner);
  assert.deepEqual(manifest.syntheticInputs.conditionIds, lesson.conditions.map(condition => condition.id));
  assert.deepEqual(manifest.syntheticInputs.actionIds, lesson.actions.map(action => action.id));
  assert.equal(manifest.syntheticInputs.requiredClient, lesson.REQUIRED_CLIENT);
  assert.equal(manifest.syntheticInputs.requiredDnsAnswer, lesson.REQUIRED_DNS);
  assert.equal(manifest.syntheticInputs.requiredDependency, lesson.REQUIRED_DEPENDENCY);
  assert.equal(manifest.syntheticInputs.privateJourneyBudgetMs, lesson.BUDGET_MS);
  assert.equal(manifest.syntheticInputs.maxRuns, lesson.MAX_RUNS);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.match(manifest.acceptance.nativeSibling, /B-S106.*D-S106.*P006/);
  assert.match(manifest.acceptance.credit, /one original.*zero extra/);
  for (const field of ['preconditions', 'actions', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[field].length > 0);
  }
});

test('standalone HTML uses standard labeled controls, local assets, visible limits and no reset shadow', () => {
  const html = read('index.html').toString('utf8');
  const app = read('app.js').toString('utf8');
  assert.ok(html.includes(banner));
  assert.match(html, /fictional <strong>DATA ONLY<\/strong>/);
  assert.match(html, /Management access must remain unexposed/);
  assert.match(html, /B-S106 and D-S106 remain unqualified/);
  assert.match(html, /<noscript>/);
  assert.match(html, /<label for="condition">/);
  assert.match(html, /<label for="operator-action">/);
  assert.match(html, /id="input-error"[^>]+role="alert"[^>]+tabindex="-1"[^>]+hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.equal(/(?:id|name)="reset"/.test(html), false);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(app), false);
  const options = id => [...html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1]
    .matchAll(/<option value="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(options('condition'), lesson.conditions.map(condition => condition.id));
  assert.deepEqual(options('operator-action'), lesson.actions.map(action => action.id));
  assert.deepEqual([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]),
    ['styles.css', 'model.js', 'app.js']);
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
});

test('runtime performs no probe/network/identity operations or persistence and uses no framework', () => {
  const runtime = `${read('model.js')}\n${read('app.js')}`;
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|sendBeacon|localStorage|sessionStorage|navigator\.credentials|\beval\s*\(|new Function/.test(runtime), false);
  assert.equal(/\brequire\s*\(|\bimport\s|https?:|azure\.com/.test(read('app.js').toString('utf8')), false);
  assert.equal(/\bDate\b|Math\.random|performance\./.test(read('model.js').toString('utf8')), false);
  assert.match(read('README.md').toString('utf8'), /DATA ONLY.*never a real/s);
});

test('CSP permits only the exact theme and local assets while refusing connections, eval, inline and forms', () => {
  const html = read('index.html').toString('utf8');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(inline.length, 1);
  const parsedScript = inline[0][1].replace(/\r\n?/g, '\n');
  const hash = crypto.createHash('sha256').update(parsedScript).digest('base64');
  assert.ok(policy.includes(`script-src 'self' 'sha256-${hash}'`));
  for (const directive of ['default-src', 'connect-src', 'object-src', 'base-uri', 'form-action', 'frame-src', 'worker-src']) {
    assert.ok(policy.includes(`${directive} 'none'`));
  }
  assert.equal(/unsafe-inline|unsafe-eval|\*|https?:|data:/.test(policy), false);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script>'));
  assert.match(inline[0][1], /clawpilotTheme/);
  assert.match(inline[0][1], /prefers-color-scheme: dark/);
  const css = read('styles.css').toString('utf8');
  assert.match(css, /--cp-bg: #f7f4ef/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /"Segoe UI", Aptos, Calibri/);
  assert.match(css, /Consolas, "Courier New"/);
  const componentCss = css.replace(/--cp-[a-z-]+:[^;]+;/g, '');
  assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(componentCss), false);
  assert.match(css, /:focus-visible/);
});

test('source snapshots separately qualify working-tree raw CRLF and exact pinned canonical Git', () => {
  const source = json(path.join('evidence', 'source-contract.json'));
  assert.equal(source.originalCard.kanoUnit, 'A-S106');
  assert.equal(source.originalCard.packet, 'SC-S106');
  assert.equal(source.originalCard.technicalEntryGate, 'SOURCE');
  assert.deepEqual(source.packetMembers, ['A-S106', 'B-S106']);
  assert.equal(source.claim.owner, 'worker-A-S106');
  assert.equal(source.claim.state, 'In Progress');
  assert.equal(source.claim.authorization, 'local-synthetic-only');
  assert.equal(source.originalAcceptance, 'Required private connectivity is verified without exposing management access; public-probe success alone cannot approve the path.');
  const fragments = new Map();
  for (const item of source.sources) {
    assert.equal(item.workingTreeLineEndings, 'CRLF');
    assert.equal(item.canonicalGit.lineEndings, 'LF');
    assert.equal(item.canonicalGit.commit, source.sourceCommit);
    const objectPath = `${source.sourceCommit}:${item.repositoryPath.split(path.sep).join('/')}`;
    const oid = execFileSync('git', ['--no-pager', 'rev-parse', objectPath], { cwd: repo }).toString('utf8').trim();
    assert.equal(oid, item.canonicalGit.blobOid);
    const pinned = execFileSync('git', ['--no-pager', 'cat-file', 'blob', oid], { cwd: repo });
    assert.equal(sha(pinned), item.canonicalGit.sha256);
    assert.notEqual(item.workingTreeRawSha256, item.canonicalGit.sha256);
    for (const fragment of item.fragments) {
      const working = raw(fragment.workingTreeRaw);
      const canonicalGit = raw(fragment.canonicalGit);
      assert.ok(working.includes(Buffer.from('\r\n')));
      assert.equal(canonicalGit.includes(Buffer.from('\r\n')), false);
      assert.ok(normalize(working).equals(canonicalGit));
      assert.ok(pinned.includes(canonicalGit));
      assert.notEqual(fragment.workingTreeRaw.sha256, fragment.canonicalGit.sha256);
      fragments.set(fragment.label, canonicalGit.toString('utf8'));
    }
  }
  assert.equal(fragments.get('readme-s106'), '| S106 | **Private endpoint/private DNS:** Test the real application access path, not only an externally reachable probe. |\n');
  assert.match(fragments.get('backlog-d-s106'), /Required private connectivity is verified without exposing management access; public-probe success alone cannot approve the path/);
  assert.match(fragments.get('card-a-s106'), /Compare public and private probes; public success cannot certify a private dependency path\. \| SOURCE/);
  assert.match(fragments.get('card-b-s106'), /actual client placement and private DNS\/connectivity.*CORE, DATA, HOST, C093/);
  assert.match(fragments.get('portable-a-contract'), /standalone, browser-openable lesson bundle/);
  assert.ok(fragments.get('portable-a-contract').includes(banner));
  assert.match(fragments.get('atomic-card-contract'), /genuine behavioral TDD red.*explicit N\/A/s);
  assert.match(fragments.get('packet-rule'), /cumulative completion totals.*same named delivery packet/);
});

test('genuine RED bytes and explicit later IaC N/A remain separate from automatic test discovery', () => {
  const red = json(path.join('evidence', 'red.json'));
  const source = json(path.join('evidence', 'source-contract.json'));
  const iac = json(path.join('evidence', 'iac-decision.json'));
  assert.equal(red.stubLoadExitCode, 0);
  assert.equal(red.assertionExitCode, 1);
  assert.equal(red.genuineBehavioralAssertionRed, true);
  const output = raw(red.output).toString('utf8');
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /actual: 'success'/);
  assert.match(output, /expected: 'unknown'/);
  assert.match(output, /# tests 2/);
  assert.match(output, /# fail 1/);
  assert.match(raw(red.loadOutput).toString('utf8'), /S106 stub loaded/);
  assert.match(raw(red.assertion).toString('utf8'), /privateProbe\.status, 'unknown'/);
  assert.match(raw(red.stub).toString('utf8'), /privateProbe: \{ status: 'success'/);
  assert.ok(raw(red.bdd).toString('utf8').includes(banner));
  assert.notEqual(red.stub.sha256, sha(read('model.js')));
  for (const entry of [red.bdd, red.stub, red.assertion, red.loadOutput, red.output]) {
    assert.ok(entry.path.startsWith(`raw${path.sep}`));
    assert.ok(entry.path.endsWith('.snapshot'));
  }
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.priorRedFinishedAtUtc, red.finishedAtUtc);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.match(read('.gitattributes').toString('utf8'), /evidence\/\*\* -text/);
});

test('only the published CRLF helper and existing signed offline browser/Node pairing are qualified', () => {
  const tooling = json(path.join('evidence', 'tooling-preflight.json'));
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(tooling.helper.rawSha256, expected);
  assert.equal(tooling.helper.rawLineEndings, 'CRLF');
  assert.equal(sha(fs.readFileSync(path.join(repo, tooling.helper.path))), expected);
  const blob = execFileSync('git', ['--no-pager', 'cat-file', 'blob', tooling.helper.gitBlobOid], { cwd: repo });
  assert.equal(sha(blob), tooling.helper.canonicalGitSha256);
  assert.notEqual(tooling.helper.rawSha256, tooling.helper.canonicalGitSha256);
  assert.ok(tooling.helper.commit.startsWith('53c0c0d'));
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.match(tooling.node, /^v22\./);
  assert.match(tooling.browser.productVersion, /^156\./);
  assert.equal(tooling.browser.signatureStatus, 'Valid');
  assert.match(tooling.browser.signer, /Microsoft Corporation/);
  assert.match(tooling.qualification, /lifecycle prototype unqualified/);
  const attempt = json(path.join('evidence', 'tooling-attempt.json'));
  assert.equal(attempt.passed, false);
  assert.equal(attempt.exitCode, 1);
  assert.match(raw(attempt.output).toString('utf8'), /module could not be loaded/);
});
