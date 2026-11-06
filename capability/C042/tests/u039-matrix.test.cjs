'use strict';

// U039: a request pipelined behind a refusal must never run. Every refusal row of the server (also the answers Node gives
// itself) x every form ([R][M], [G][R][M], two writes, [M][R], chunked, Expect) x the HTTP framings, with raw sockets, in this
// process and in a SEPARATE server process. After EVERY variant: the client got exactly the expected answers, the refusal is
// typed with Connection: close, the SERVER ended the connection, and the state, the revision and the journal hash are
// unchanged (or, when the mutation came FIRST, equal to the state after that mutation alone).
// RED replay: U039_SUBJECT=v1 U039_CLOSE_MS=1500 (the archived accepted bytes). Mutants: U039_SUBJECT=file:<path>.
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { FORMS, FRAMINGS, ROWS, mutation, parts, step } = require('./u039-rows.cjs');

const TIMEOUT = 900000;
const JSON_TYPE = { 'Content-Type': 'application/json' };
const label = (target, framing, row, form) => `${target.name} ${framing.id} ${row.id} ${form.name}`;
let child = null;

async function apply(instance, body) {
  const host = `127.0.0.1:${instance.port}`;
  const bytes = lib.req('POST', '/v1/steps', { host, headers: { ...JSON_TYPE, Connection: 'close' }, body });
  const { responses } = await lib.exchange(instance.port, [{ data: bytes }], { answers: 1 });
  assert.equal(responses[0].status, 201, 'the setup step is applied');
}

async function trial(target, row, writes, extra = {}) {
  const instance = await target.start(row.options ?? {});
  try {
    for (const body of row.setup ?? []) await apply(instance, body);
    const before = await instance.state();
    const result = await lib.exchange(instance.port, writes(`127.0.0.1:${instance.port}`), extra);
    return { before, after: await lib.settled(instance), result };
  } finally {
    await instance.close();
  }
}

const statuses = (result) => result.responses.map((item) => item.status ?? (item.partial === undefined ? 'garbage' : 'partial'));
// Every variant is counted before any assertion, so that a RED run reports how many refusal variants applied the mutation.
const LEDGER = [];

function record(target, framing, row, form, got) {
  const changed = JSON.stringify(got.after) !== JSON.stringify(got.before);
  LEDGER.push({ variant: label(target, framing, row, form), form: form.id, applied: changed, behindRefusal: changed && !form.applied, kept: !got.result.closedByServer, answers: statuses(got.result) });
}

function check(target, framing, row, form, base, got) {
  const name = label(target, framing, row, form);
  const expected = form.answers(row.status, row.mutationStatus ?? 201);
  const seen = statuses(got.result);
  if (form.tolerant && seen.length === 0) assert.ok(got.result.socketError, `${name}: no answer without a reset`);
  else assert.deepEqual(seen, expected, `${name}: the client must receive exactly these answers`);
  const refusal = got.result.responses.at(-1);
  if (seen.length > 0) {
    assert.equal(refusal.code, row.code, `${name}: the refusal is typed`);
    assert.equal(refusal.reason, http.STATUS_CODES[row.status], `${name}: the status line carries the standard reason phrase`);
    assert.equal(refusal.connection, 'close', `${name}: the refusal says Connection: close`);
  }
  assert.equal(got.result.closedByServer, true, `${name}: the SERVER ends the connection`);
  assert.deepEqual(got.after, form.applied ? base.after : got.before, `${name}: state, revision and journal ${form.applied ? 'show only the first mutation' : 'are unchanged'}`);
  if (form.applied) assert.notDeepEqual(got.after, got.before, `${name}: the mutation that came first applied`);
}

async function rowTest(target, framing, row, forms) {
  const base = await trial(target, row, (host) => [{ data: (row.mutation ?? mutation)(host) }], { answers: 1 });
  assert.notDeepEqual(base.after, base.before, 'the mutation alone applies');
  const runs = await Promise.all(forms.map((form) => trial(target, row, (host) => form.writes(parts(row, host, framing)))));
  forms.forEach((form, index) => record(target, framing, row, form, runs[index]));
  forms.forEach((form, index) => check(target, framing, row, form, base, runs[index]));
}

const inProcess = { name: 'in-process', start: (options) => lib.startInProcess(options) };
const separate = { name: 'separate-process', start: (options) => child.start(options) };
const CORE = FORMS.filter((form) => ['RM', 'GRM', 'TWO', 'MR'].includes(form.id));
// Node applies Expect only to HTTP/1.1; a 1.0 request with that header is an ordinary (valid) request, not a refusal.
const applies = (row, framing) => !row.http11 || framing.r === '1.1';
const COUNT = ROWS.length * (FORMS.length + 3) + FRAMINGS.reduce((sum, framing) => sum + ROWS.filter((row) => applies(row, framing)).length * CORE.length, 0);

test.before(async () => { child = await lib.startChild(); });
test.after(async () => { await child.stop(); });

test('the matrix is complete: the rows cover every refusal status of the server and every Node-own answer', () => {
  assert.deepEqual([...new Set(ROWS.map((row) => row.status))].sort(), [400, 403, 404, 405, 413, 414, 415, 417, 421, 422, 409, 431, 500, 503].sort((a, b) => a - b));
  assert.deepEqual(ROWS.filter((row) => row.kind === 'node').map((row) => row.id), ['N417expect', 'N421nohost', 'N405connect', 'N400garbage', 'N431header']);
  assert.equal(ROWS.length, 28);
  assert.deepEqual(FORMS.map((form) => form.id), ['RM', 'GRM', 'TWO', 'MR', 'RMchunked', 'RMexpect']);
  assert.deepEqual(FRAMINGS.map((framing) => framing.id), ['h11', 'h10-m', 'h10-r', 'h10']);
  assert.equal(step().units, 3);
});

for (const row of ROWS) {
  test(`in-process h11 ${row.id}: every form (${row.kind} refusal ${row.status} ${row.code})`, { timeout: TIMEOUT }, () => rowTest(inProcess, FRAMINGS[0], row, FORMS));
}
for (const row of ROWS) {
  test(`in-process h10-m ${row.id}: the pipelined mutation in HTTP/1.0 framing`, { timeout: TIMEOUT }, () => rowTest(inProcess, FRAMINGS[1], row, CORE.filter((form) => form.id !== 'TWO')));
}
for (const framing of FRAMINGS) {
  for (const row of ROWS.filter((item) => applies(item, framing))) {
    test(`separate-process ${framing.id} ${row.id}: ${row.kind} refusal ${row.status} ${row.code}`, { timeout: TIMEOUT }, () => rowTest(separate, framing, row, CORE));
  }
}

test('summary: no variant applied a mutation behind a refusal and every refused connection was ended by the server', () => {
  const refusals = LEDGER.filter((item) => item.form !== 'MR');
  const applied = refusals.filter((item) => item.behindRefusal);
  const kept = refusals.filter((item) => item.kept);
  const hidden = applied.filter((item) => item.answers.length < 2);
  console.log(`# U039 matrix: ${LEDGER.length} variants; ${refusals.length} with a request behind a refusal; ${applied.length} applied behind a refusal (${hidden.length} hidden from the client); ${kept.length} left the connection open`);
  assert.equal(LEDGER.length, COUNT, `the whole matrix ran: ${LEDGER.length} variants`);
  assert.equal(applied.length, 0, `${applied.length} of ${refusals.length} refusal variants applied the mutation: ${applied.slice(0, 5).map((item) => item.variant).join('; ')}`);
  assert.equal(kept.length, 0, `${kept.length} refused connections stayed open`);
});
