'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const repository = path.resolve(__dirname, '..', '..', '..');
const catalog = require('../accepted-catalog.js');
const { startHost } = require('../serve.cjs');
const checks = require('./browser-checks.cjs');
const { openIsolatedLoopback } = require(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
const { qualifyEdge } = require(path.join(repository, 'testing', 'browser', 'qualify', 'qualify.cjs'));
const { openLookAlike } = require(path.join(repository, 'testing', 'browser', 'lifecycle', 'tests', 'u006-owned-lookalike.cjs'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

async function main() {
  const record = {
    schema: 'U054-actual-browser/1', platform: process.platform,
    proof: 'Actual isolated Edge with LF or CRLF source bytes on Windows; not native Linux or native browser TCP qualification',
    integratedBrowserUsed: false, stages: [], assets: [], cleanup: {}
  };
  let fixture;
  let session;
  let owned;
  let failure;
  const pending = [];
  const responseErrors = [];
  try {
    const edge = await qualifyEdge();
    assert.equal(edge.ok, true, edge.reasons.join(' | '));
    assert.equal(edge.signature.publisher, 'Microsoft Corporation');
    record.edge = { version: edge.version, major: edge.major, sha256: edge.sha256,
      qualifiedMajors: edge.qualifiedMajors, qualifiedVia: edge.qualifiedVia };
    fixture = await startHost({ ttlMs: 900000 });
    owned = await openLookAlike('capability\\C041\\index.html', {
      opener: async relative => {
        session = await openIsolatedLoopback(relative, fixture.server);
        return session;
      }
    });
    record.identity = owned.identity;
    assert.equal(await owned.isAlive(), true, 'authenticated browser PID and native creation identity remain owned');
    assert.equal(Number(session.browserVersion.split('.')[0]), edge.major);
    record.browserVersion = session.browserVersion;
    if (process.env.U054_BROWSER_INJECT_FAILURE === '1') assert.fail('U054 injected post-open assertion; exact owned cleanup must still run');
    session.page.setDefaultTimeout(60000);
    session.page.on('response', response => {
      const target = new URL(response.url()).pathname;
      for (const lesson of catalog.lessons) {
        const asset = lesson.assets.find(asset => target === `/c041-lessons/${lesson.id}/${asset.file}`);
        if (!asset) continue;
        pending.push((async () => {
          const bytes = await response.body();
          const actual = fs.readFileSync(path.join(repository, ...asset.path.split('\\')));
          assert.equal(response.status(), 200, asset.path);
          assert.deepEqual(bytes, actual, asset.path);
          assert.ok(sha(bytes) === asset.rawSha256 || sha(lf(bytes)) === asset.crlfToLfSha256, asset.path);
          const csp = (await response.allHeaders())['content-security-policy'];
          assert.match(csp, /sandbox allow-scripts/);
          assert.doesNotMatch(csp, /allow-same-origin|unsafe-inline|unsafe-eval/);
          record.assets.push({ path: asset.path, rawSha256: sha(bytes), crlfToLfSha256: sha(lf(bytes)),
            rawPinMatched: sha(bytes) === asset.rawSha256, canonicalPinMatched: sha(lf(bytes)) === asset.crlfToLfSha256 });
        })().catch(error => { responseErrors.push(error); }));
      }
    });
    for (const name of ['verifyKeyboardWarmLesson', 'verifyCanaryLesson', 'verifyIsolation', 'verifyRefusalsAndMessages']) {
      record.stages.push(await checks[name](session.page));
    }
    await Promise.all(pending);
    if (responseErrors.length) throw new AggregateError(responseErrors, 'U054 actual response-body assertions failed');
    assert.equal(new Set(record.assets.map(asset => asset.path)).size, 8, 'all eight actual browser response bodies observed');
    record.passed = true;
  } catch (error) {
    failure = error;
    record.passed = false;
    record.failure = { name: error.name, message: error.message };
  } finally {
    try {
      if (owned) {
        record.cleanup.owned = await owned.close();
        record.cleanup.pageClosed = session.page.isClosed();
        assert.equal(record.cleanup.owned.clean, true);
        assert.equal(record.cleanup.pageClosed, true);
      } else if (session) {
        await session.close();
        record.cleanup.pageClosed = session.page.isClosed();
      }
    } catch (error) {
      record.passed = false;
      record.cleanup.error = { name: error.name, message: error.message };
      failure = failure ? new AggregateError([failure, error], 'U054 browser and owned cleanup failed') : error;
    } finally {
      if (fixture) {
        await fixture.close();
        record.cleanup.listenerStopped = !fixture.server.listening;
      }
    }
    console.log(JSON.stringify(record));
  }
  if (failure) throw failure;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
