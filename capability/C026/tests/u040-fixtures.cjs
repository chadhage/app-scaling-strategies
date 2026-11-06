'use strict';

// Test tooling, not production code: the refusal table, the fixtures (in this process and in a separate node process) and the
// probe that sends one pipelined variant and reports what the hub, the transcript producer and the client saw.
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createLocalServer, closeServer } = require('../server.cjs');
const { wire, upgradeWithHello, exchange } = require('./u040-support.cjs');

const FRAMINGS = Object.freeze(['1.1', '1.0k']);
const MODES = Object.freeze(['in-process', 'separate']);
const refusal = (name, status, code, options = {}) => Object.freeze({
  name, status, code, framings: ['1.1', '1.0k'], transcript: 'ok', callsItself: false, noContinue: false, ...options
});
// Every refusal the server can decide on a plain request, including the ones Node used to answer itself (Expect, no Host).
const REFUSALS = Object.freeze([
  refusal('404 GET /nope', 404, 'NOT_FOUND', { request: { target: '/nope' } }),
  refusal('405 POST /scope.json', 405, 'METHOD_NOT_ALLOWED', { request: { method: 'POST', target: '/scope.json' } }),
  refusal('421 foreign Host', 421, 'LOCAL_HOST_REQUIRED', { request: { target: '/scope.json', host: 'evil.example:1' } }),
  refusal('403 foreign Origin', 403, 'CROSS_ORIGIN_DENIED', { request: { target: '/scope.json', headers: ['Origin: http://evil.example'] } }),
  refusal('426 plain GET /stream', 426, 'UPGRADE_REQUIRED', { request: { target: '/stream' } }),
  refusal('400 query', 400, 'INVALID_QUERY', { request: { target: '/page.js?x=1' } }),
  refusal('400 body with Content-Length', 400, 'UNEXPECTED_BODY', { request: { target: '/', headers: ['Content-Length: 5'], body: 'hello' } }),
  refusal('400 chunked body', 400, 'UNEXPECTED_BODY', { request: { target: '/', headers: ['Transfer-Encoding: chunked'], body: '5\r\nhello\r\n0\r\n\r\n' } }),
  refusal('400 URL', 400, 'INVALID_URL', { request: { target: '//' } }),
  refusal('500 transcript failure (decided after an await)', 500, 'TRANSCRIPT_UNAVAILABLE', { transcript: 'fail', callsItself: true, request: { target: '/transcript.json' } }),
  refusal('417 unknown Expect (Node answered it itself)', 417, 'EXPECTATION_FAILED', { framings: ['1.1'], request: { target: '/scope.json', headers: ['Expect: nonsense'] } }),
  refusal('404 with Expect: 100-continue (Node sent 100 itself)', 404, 'NOT_FOUND', { framings: ['1.1'], noContinue: true, request: { target: '/nope', headers: ['Expect: 100-continue'] } }),
  refusal('421 no Host (Node answered it itself)', 421, 'LOCAL_HOST_REQUIRED', { request: { target: '/scope.json', host: null } })
]);

// Five pipelines of every refusal in one write ([R][M], [G][R][M], [R][T], [G][R][T]) plus the answered-first and 5 ms forms of the
// audit; M is the valid upgrade with a masked hello frame, G a valid read, T a read of /transcript.json (it reaches the spy).
const FORMS = Object.freeze(['R,M', 'G,R,M', 'R then M after the answer', 'R then M after 5 ms', 'R,T', 'G,R,T']);

const buildRefusal = (spec, host, framing) => wire({ host, framing, ...spec.request, host: spec.request.host === undefined ? host : spec.request.host });

function writesFor(form, spec, host, rFraming, mFraming) {
  const refused = buildRefusal(spec, host, rFraming);
  const valid = wire({ target: '/scope.json', host, framing: rFraming });
  const upgrade = upgradeWithHello(host, mFraming);
  const transcript = wire({ target: '/transcript.json', host, framing: rFraming });
  return {
    'R,M': [{ data: Buffer.concat([refused, upgrade]) }],
    'G,R,M': [{ data: Buffer.concat([valid, refused, upgrade]) }],
    'R then M after the answer': [{ data: refused }, { data: upgrade, after: 'answer' }],
    'R then M after 5 ms': [{ data: refused }, { data: upgrade, after: 5 }],
    'R,T': [{ data: Buffer.concat([refused, transcript]) }],
    'G,R,T': [{ data: Buffer.concat([valid, refused, transcript]) }]
  }[form];
}

function cleanEnvironment() {
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  return env;
}

async function inProcessFixture(transcript) {
  const counters = { transcripts: 0 };
  const producers = {
    none: null,
    ok: () => { counters.transcripts += 1; return Promise.resolve({ ok: true }); },
    fail: () => { counters.transcripts += 1; return Promise.reject(new Error('boom')); }
  };
  const server = createLocalServer({ transcript: producers[transcript] });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  return {
    port, host: `127.0.0.1:${port}`, server,
    state: async () => ({ sessions: server.hub.sessionCount(), transcripts: counters.transcripts }),
    close: () => closeServer(server)
  };
}

// The fixture in its own node process: the attacker and the server no longer share an event loop. The child is killed after hardMs.
async function separateFixture(transcript, hardMs = 120000) {
  const child = spawn(process.execPath, [path.join(__dirname, 'u040-child.cjs'), transcript], {
    stdio: ['pipe', 'pipe', 'ignore'], env: cleanEnvironment(), windowsHide: true
  });
  child.stdin.on('error', () => {});
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const killer = setTimeout(() => child.kill('SIGKILL'), hardMs);
  exited.then(() => clearTimeout(killer));
  const lines = [];
  const waiters = [];
  let pending = '';
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    const parts = pending.split('\n');
    pending = parts.pop();
    for (const part of parts) (waiters.length > 0 ? waiters.shift()(part) : lines.push(part));
  });
  const nextLine = () => new Promise((resolve, reject) => {
    if (lines.length > 0) { resolve(lines.shift()); return; }
    waiters.push(resolve);
    exited.then(() => reject(new Error('the fixture child exited')));
  });
  const { port } = JSON.parse(await nextLine());
  return {
    port, host: `127.0.0.1:${port}`,
    state: async () => { child.stdin.write('state\n'); return JSON.parse(await nextLine()); },
    async close() {
      child.stdin.end();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      child.kill('SIGKILL');
    }
  };
}

const startFixture = (mode, transcript) => (mode === 'separate' ? separateFixture(transcript) : inProcessFixture(transcript));

// Sends one variant on a fresh connection and returns what happened, relative to the state before it.
async function probe(fixture, { spec, form, rFraming, mFraming }) {
  const before = await fixture.state();
  const result = await exchange(fixture.port, writesFor(form, spec, fixture.host, rFraming, mFraming));
  const after = await fixture.state();
  return { ...result, sessions: after.sessions - before.sessions, transcripts: after.transcripts - before.transcripts };
}

// The behaviour required behind a refusal: the earlier answers and the refusal only, no 101, no session, the connection closed,
// and nothing but the refusal itself reached the transcript producer. In the form that writes the upgrade 5 ms later, the client's own
// late write can make the OS reset the connection before it has read the refusal, so there the answers only have to be a prefix.
function problemsOf(result, spec, form) {
  const problems = [];
  const statuses = form === 'G,R,M' || form === 'G,R,T' ? [200, spec.status] : [spec.status];
  const prefixOnly = form === 'R then M after 5 ms';
  const shown = prefixOnly ? statuses.slice(0, result.statuses.length) : statuses;
  if (JSON.stringify(result.statuses) !== JSON.stringify(shown)) problems.push(`answers ${JSON.stringify(result.statuses)} instead of ${JSON.stringify(statuses)}`);
  if (result.sessions !== 0) problems.push(`${result.sessions} hub session(s) created`);
  if (result.saw101) problems.push('a 101 was sent');
  if (result.transcripts !== (spec.callsItself ? 1 : 0)) problems.push(`${result.transcripts} transcript call(s)`);
  if (!result.closedByServer) problems.push(`the connection was not closed (${result.reason})`);
  return problems;
}

async function sweep(mode, spec, { forms = FORMS } = {}) {
  const fixture = await startFixture(mode, spec.transcript);
  const report = { variants: 0, applied: 0, problems: [] };
  try {
    for (const form of forms) {
      for (const rFraming of spec.framings) {
        for (const mFraming of form.endsWith('T') ? ['1.1'] : ['1.1', '1.0']) {
          const result = await probe(fixture, { spec, form, rFraming, mFraming });
          const problems = problemsOf(result, spec, form);
          report.variants += 1;
          if (result.sessions > 0) report.applied += 1;
          if (problems.length > 0) report.problems.push(`[${form}] refusal ${rFraming}, upgrade ${mFraming}: ${problems.join('; ')}`);
        }
      }
    }
  } finally {
    await fixture.close();
  }
  return report;
}

module.exports = Object.freeze({
  FRAMINGS, MODES, REFUSALS, FORMS, buildRefusal, writesFor, startFixture, probe, problemsOf, sweep, cleanEnvironment
});
