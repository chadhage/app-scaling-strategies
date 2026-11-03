'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('../accepted-catalog.js');
const { startHost } = require('../serve.cjs');
const checks = require('./browser-checks.cjs');

async function run() {
  const startedAtUtc = new Date().toISOString();
  const record = {
    schemaVersion: 1, cardId: 'C041', startedAtUtc,
    command: 'node capability\\C041\\tests\\browser-run.cjs',
    mode: 'isolated headless real Microsoft Edge via verified shared helper',
    transportBoundary: 'Guarded same-owned-origin GET/HEAD route.fetch(maxRedirects:0) forwards real server responses unchanged; real DOM/CSP/keyboard proof, not native Chromium TCP transport certification',
    integratedBrowserUsed: false,
    nodeVersion: process.version,
    stages: [],
    childDocumentResponses: [],
    consolePolicyErrors: [],
    cleanup: {}
  };
  let fixture;
  let session;
  let currentStage = 'verified shared helper and owned fixture startup';
  try {
    const sharedPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
    const shared = require(sharedPath);
    if (typeof shared.openIsolatedLoopback !== 'function') {
      throw new Error('Verified guarded openIsolatedLoopback API is required; no file/URL workaround is permitted.');
    }
    const manifest = require(path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'package.json'));
    record.playwrightVersion = manifest.devDependencies?.playwright || manifest.dependencies?.playwright;
    record.sharedHelper = {
      path: 'testing\\browser\\isolated.cjs',
      commit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
      tag: 'kanban/flow-browser/53c0c0d82cc1',
      sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(sharedPath)).digest('hex'),
      importedOnlyAfterVerifiedReady: true
    };
    fixture = await startHost({ ttlMs: 300000 });
    record.fixture = { address: fixture.server.address().address, port: fixture.server.address().port, lifetimeMs: 300000, ownedEntry: 'capability\\C041\\index.html' };
    session = await shared.openIsolatedLoopback('capability\\C041\\index.html', fixture.server);
    record.browserVersion = session.browserVersion;
    const page = session.page;
    page.setDefaultTimeout(3000);
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy|sandboxed/.test(message.text())) {
        record.consolePolicyErrors.push(message.text().slice(0, 1200));
      }
    });
    const responseChecks = [];
    const responseErrors = [];
    page.on('response', response => {
      if (/\/c041-lessons\/A-S00[13]\/index\.html$/.test(response.url())) {
        responseChecks.push((async () => {
          const responsePath = new URL(response.url()).pathname;
          const lesson = catalog.lessons.find(entry => entry.entry === responsePath);
          const expectedSha256 = lesson.assets.find(asset => asset.file === 'index.html').sha256;
          const bodySha256 = crypto.createHash('sha256').update(await response.body()).digest('hex');
          const csp = (await response.allHeaders())['content-security-policy'];
          record.childDocumentResponses.push({
            path: responsePath, status: response.status(), csp, bodySha256,
            expectedSha256, bodyMatchesPinned: bodySha256 === expectedSha256
          });
          checks.must(response.status() === 200 && bodySha256 === expectedSha256, 'Actual browser child body matches accepted pin');
          checks.must(csp.includes('sandbox allow-scripts') && !csp.includes('allow-same-origin'), 'Actual child response sandbox without same-origin');
        })().catch(error => responseErrors.push(error.message)));
      }
    });
    for (const name of ['verifyKeyboardWarmLesson', 'verifyCanaryLesson', 'verifyIsolation', 'verifyRefusalsAndMessages']) {
      currentStage = name;
      const start = Date.now();
      record.stages.push({ ...await checks[name](page), elapsedMs: Date.now() - start });
    }
    currentStage = 'actual browser child response-body and CSP assertions';
    await Promise.all(responseChecks);
    checks.must(record.childDocumentResponses.length === 2 && responseErrors.length === 0, `Actual response assertions: ${responseErrors.join('; ')}`);
    record.passed = true;
  } catch (error) {
    record.passed = false;
    record.failure = { stage: currentStage, name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        await session.close();
        record.cleanup.browserCloseResolved = true;
        record.cleanup.pageClosed = session.page.isClosed();
      } catch (error) {
        record.passed = false;
        record.cleanup.browserError = error.message;
      }
    }
    if (fixture) {
      try {
        await fixture.close();
        record.cleanup.ownedHelperStopped = !fixture.server.listening;
      } catch (error) {
        record.passed = false;
        record.cleanup.helperError = error.message;
      }
    }
    record.finishedAtUtc = new Date().toISOString();
    const evidence = path.join(__dirname, '..', 'evidence');
    const attemptsPath = path.join(evidence, 'browser-attempts.json');
    const attempts = fs.existsSync(attemptsPath) ? JSON.parse(fs.readFileSync(attemptsPath, 'utf8')) : [];
    attempts.push(record);
    fs.writeFileSync(attemptsPath, JSON.stringify(attempts, null, 2) + '\n');
    fs.writeFileSync(path.join(evidence, 'browser.json'), JSON.stringify(record, null, 2) + '\n');
  }
  console.log(JSON.stringify(record, null, 2));
  if (!record.passed) process.exitCode = 1;
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
