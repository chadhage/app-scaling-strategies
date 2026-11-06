'use strict';

// Test tooling, not production code: observes the real page in a real isolated headless Edge through the shared loopback helper.
// The helper permits only GET and HEAD to the exact origin, so every preview (GET) is observed live and the POST behind "Send"
// is observed as blocked ("not sent"). Real POST outcomes are proven over real loopback sockets by the Node suites.
// Usage (heavy slot; CAPTURE_BROWSER_EVIDENCE stays unset, nothing is written): node capability\C009\tests\browser.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const approved = require('../../C001/approved-contract.js').approval;
const { startLocal } = require('../cli.cjs');
const { qualifyEdge } = require(path.join(repositoryRoot, 'testing', 'browser', 'qualify', 'qualify.cjs'));

const COMMANDS = ['run.create', 'scratch.create', 'pool.resize', 'experiment.approve', 'native.execute'];
const DASH = '\u2014';
const allowed = (command, role) => [command, 'allowed', '200', 'ok', role];
const denied = (command, role, status = '403', code = 'ROLE_FORBIDDEN') => [command, 'denied', status, code, role];
const refused = (code) => COMMANDS.map((command) => [command, 'refused', '401', code, DASH]);
const decisions = (role, ...may) => COMMANDS.map((command) => (may.includes(command) ? allowed(command, role)
  : command === 'native.execute' ? denied(command, role, '404', 'COMMAND_UNKNOWN') : denied(command, role)));

function checked(name, observed) {
  console.log(`PASS ${name}: ${JSON.stringify(observed)}`);
}

async function ask(page, token, claim = '') {
  await page.fill('#token', token);
  await page.selectOption('#claim', claim);
  await page.click('#check');
  await page.waitForFunction(() => !/^(Checking|Not checked)/.test(document.getElementById('status').textContent));
  return { rows: await page.$$eval('#rows tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent))), status: await page.textContent('#status') };
}

async function main() {
  // Microsoft-signed and a qualified major, with no equality pin on a build or a hash: qualifyEdge checks the Authenticode signature
  // and publisher and that the major is listed in testing\browser\qualify\qualified.json, and it fails closed (about 6 to 15 s).
  const edge = await qualifyEdge();
  assert.equal(edge.ok, true, edge.reasons.join(' | '));
  checked('the installed Edge is Microsoft-signed and its major is qualified', {
    version: edge.version, major: edge.major, signature: edge.signature.status, publisher: edge.signature.publisher, sha256: edge.sha256, path: edge.path
  });
  const local = await startLocal({ readApproval: () => approved, lifetimeMs: 300000 });
  let session;
  try {
    session = await openIsolatedLoopback(path.join('capability', 'C009', 'index.html'), local.server);
    const { page } = session;
    console.log(`Edge ${session.browserVersion}, page ${local.origin}/ (synthetic, loopback, isolated headless)`);
    assert.equal(Number(String(session.browserVersion).split('.')[0]), edge.major, 'the launched browser has the qualified major');
    const pageErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push(`${request.method()} ${new URL(request.url()).pathname}`));
    await page.reload({ waitUntil: 'load' });
    assert.match(await page.textContent('#status'), /^Not checked yet\. Nothing is shown as allowed/);
    assert.equal(await page.textContent('#revision'), '0');
    checked('initial state shows no decision and the server revision', await page.textContent('#status'));

    const none = await ask(page, '');
    assert.deepEqual(none.rows, refused('AUTHENTICATION_REQUIRED'));
    assert.match(none.status, /refused the credential: AUTHENTICATION_REQUIRED\. Nothing is shown as allowed/);
    checked('no token: every command is refused 401 AUTHENTICATION_REQUIRED', none.status);

    const expectations = [
      ['conductor-a', decisions('conductor', 'run.create', 'scratch.create')],
      ['conductor-b', decisions('conductor', 'run.create', 'scratch.create')],
      ['operator', decisions('operator', 'pool.resize', 'experiment.approve')],
      ['visitor', decisions('visitor')]
    ];
    for (const [identity, rows] of expectations) {
      const answer = await ask(page, local.tokens[identity]);
      assert.deepEqual(answer.rows, rows, identity);
      assert.match(answer.status, /^Server decisions for /);
      checked(`${identity}: the page shows exactly the server's decisions`, answer.rows.map((row) => row.slice(0, 4).join(' ')));
    }
    for (const claim of ['operator', 'conductor']) {
      const answer = await ask(page, local.tokens.visitor, claim);
      assert.deepEqual(answer.rows, decisions('visitor'), `claimed role ${claim}`);
    }
    checked('a visitor token with an X-Role claim selected is still a visitor everywhere', 'claims operator and conductor changed nothing');
    const claimed = await ask(page, local.tokens.operator, 'visitor');
    assert.deepEqual(claimed.rows, decisions('operator', 'pool.resize', 'experiment.approve'));
    checked('an operator token with an X-Role: visitor claim keeps the operator decisions', 'unchanged');

    const forged = await ask(page, `c009_${'A'.repeat(43)}`);
    assert.deepEqual(forged.rows, refused('TOKEN_UNKNOWN'));
    const expired = await ask(page, local.app.issueToken('operator', { ttlMs: 0 }));
    assert.deepEqual(expired.rows, refused('TOKEN_EXPIRED'));
    const malformed = await ask(page, 'not-a-token');
    assert.deepEqual(malformed.rows, refused('TOKEN_MALFORMED'));
    checked('forged, expired and malformed tokens are refused with their typed codes and nothing is shown as allowed', [forged.status, expired.status, malformed.status]);

    await page.fill('#token', local.tokens.operator);
    await page.selectOption('#command', 'pool.resize');
    await page.click('#send');
    await page.waitForFunction(() => !/^Nothing sent/.test(document.getElementById('sent').textContent));
    assert.match(await page.textContent('#sent'), /^Not sent: no server decision\./);
    assert.equal(await page.textContent('#revision'), '0');
    assert.equal(local.app.snapshot().revision, 0, 'nothing changed on the server');
    checked('the POST behind Send is blocked by the read-only helper: shown as not sent, revision still 0', await page.textContent('#sent'));

    assert.deepEqual(pageErrors, []);
    assert.ok(requests.length > 0 && requests.every((line) => /^(GET|HEAD|POST) \//.test(line)), 'only same-origin requests were made');
    assert.equal(requests.filter((line) => line.startsWith('GET /v1/authorization/preview')).length >= 8 * 5, true);
    checked('no page error; same-origin requests only', { requests: requests.length, previews: requests.filter((line) => line.includes('preview')).length });
  } finally {
    try { if (session) await session.close(); } finally { await local.close(); }
  }
  console.log('C009 BROWSER OK');
}

main().catch((error) => {
  console.error(`C009 BROWSER FAILED: ${error.stack || error.message}`);
  process.exitCode = 1;
});
