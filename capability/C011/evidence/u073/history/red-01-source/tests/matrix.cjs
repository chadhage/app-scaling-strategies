'use strict';

// Test tooling, not production code: the pipelining matrix (rev-C009 F1b, rev-C017 F11 and F12, rev-C059 N1, rev-C059 D1: the FAMILY, tested through the
// effect on shared state). One raw TCP socket sends several requests, the refusal R of a row of rows.cjs somewhere in the middle. Whatever stands behind R
// must never run, whatever stands before it is answered once and in order, and the server ends the connection. G is an authorized read of the cell's own
// reservation X, A an authorized reserve with a key of the cell, D an authorized release of X (a mutation WITHOUT a body), T an authorized batch that
// releases X (a mutation with a body); a shape with a cut sends its bytes in two TCP writes. Two and three requests BEFORE the refusal are shapes of their
// own (a lane that drops its queue when a Node-own answer is decided at parse time loses the earlier ones and never closes: C059 N1).
// What ANOTHER connection can observe after the exchange decides the cell: the key of A is replayed only when A ran, X is released only when D or T ran.
const { call } = require('./helpers.cjs');
const { bare, bearer, exchange, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { ROWS, label } = require('./rows.cjs');

const SHAPES = Object.freeze([
  { name: 'R A', parts: ['R', 'A'] }, { name: 'R D', parts: ['R', 'D'] }, { name: 'R T', parts: ['R', 'T'] }, { name: 'A R D', parts: ['A', 'R', 'D'] },
  { name: 'G G R A', parts: ['G', 'G', 'R', 'A'] }, { name: 'G G G R', parts: ['G', 'G', 'G', 'R'] }, { name: 'G G R D', parts: ['G', 'G', 'R', 'D'] }, { name: 'D G R', parts: ['D', 'G', 'R'] },
  { name: 'R | A', parts: ['R', 'A'], cut: 1 }, { name: 'G R | T', parts: ['G', 'R', 'T'], cut: 2 }
]);
// Every row runs the three shapes that matter most (a reserve behind the refusal, two earlier reads then a body-less release, a batch behind); one row
// per refusal PATH runs all of them: the decisions made before any await (credential, role, target), after one (a body), at the commit (the bounds,
// the key), and what Node answers itself.
const BASIC = Object.freeze(['R A', 'G G R D', 'R T']);
const FULL = new Set(['TOKEN_EXPIRED', 'ROLE_FORBIDDEN', 'RESERVATION_NOT_FOUND', 'BODY_TOO_LARGE', 'INPUT_INVALID', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_LIMIT_REACHED', 'CAPACITY_EXCEEDED', 'LEASE_CAP_EXCEEDED', 'METHOD_NOT_ALLOWED',
  'URL_TOO_LONG', 'EXPECTATION_FAILED', 'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'UNEXPECTED_BODY']);
// The HTTP/1.0 framings run for one row per refusal path as well (the version logic does not depend on which code the row answers with).
const V10 = new Set(['TOKEN_EXPIRED', 'ROLE_FORBIDDEN', 'RESERVATION_NOT_FOUND', 'BODY_TOO_LARGE', 'INPUT_INVALID', 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_LIMIT_REACHED', 'CAPACITY_EXCEEDED', 'URL_TOO_LONG', 'METHOD_NOT_ALLOWED',
  'QUERY_REJECTED', 'INTERNAL_ERROR', 'LOCAL_HOST_REQUIRED', 'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'EXPECTATION_FAILED']);
// Node applies maxRequestsPerSocket to HTTP/1.1 only, so nothing here may depend on it: every request HTTP/1.0 with keep-alive, or the refusal
// and what stands before it HTTP/1.1 and what stands behind it plain HTTP/1.0 (which Node answers with a close). A shape never holds more than
// four requests: the lanes cut a client that has more than that in flight (README, limits), which is a bound and not a refusal.
const FRAMINGS = Object.freeze([
  { name: 'HTTP/1.1', version: null },
  { name: 'HTTP/1.0 keep-alive', version: 'HTTP/1.0', keepAlive: true, shapes: ['R A', 'G G R D', 'A R D'] },
  { name: 'refusal then HTTP/1.0', version: 'HTTP/1.0', keepAlive: false, behindOnly: true, shapes: ['R A', 'G G R D', 'G G R A'] }
]);
const MUTATIONS = new Set(['A', 'D', 'T']);

function reframe(bytes, framing) {
  const text = bytes.toString('latin1');
  const line = /^([A-Z]+ \S+) HTTP\/1\.1\r\n/.exec(text);
  if (!line) return bytes;
  return Buffer.from(text.replace(line[0], () => `${line[1]} ${framing.version}\r\n${framing.keepAlive ? 'Connection: keep-alive\r\n' : ''}`), 'latin1');
}

const isSubsequence = (actual, expected) => {
  let at = 0;
  return actual.every((status) => {
    at = expected.indexOf(status, at);
    if (at === -1) return false;
    at += 1;
    return true;
  });
};

// C011_MATRIX_ONLY selects cells for the mutation run: a regular expression over "<row> [<shape>] <framing>".
const ONLY = process.env.C011_MATRIX_ONLY ? new RegExp(process.env.C011_MATRIX_ONLY) : null;
const cellsOf = (row) => SHAPES.flatMap((shape) => FRAMINGS.map((framing) => [shape, framing])).filter(([shape, framing]) => !row.skips?.includes(framing.name)
  && (framing.version === null || V10.has(row.code)) && (framing.shapes ? framing.shapes.includes(shape.name) : FULL.has(row.code) || BASIC.includes(shape.name))
  && !(row.bound && shape.parts.slice(0, shape.parts.indexOf('R')).some((name) => MUTATIONS.has(name)))
  && (ONLY === null || ONLY.test(`${label(row)} [${shape.name}] ${framing.name}`)));

// One cell: the bytes of the shape in the framing, the answers, whether the server ended the connection; then what another connection observes.
async function exchangeCell(target, row, shape, framing, cell) {
  const { port, tokens } = target;
  const b = tokens['conductor-b'];
  const ctx = { port, tokens, foreign: cell.foreign, n: cell.n };
  const refusalAt = shape.parts.indexOf('R');
  const parts = {
    R: () => row.request(ctx), G: () => bare(port, 'GET', `/v1/reservations/${cell.x}`, [bearer(b)]),
    A: () => withBody(port, 'POST', '/v1/reservations', [bearer(b), JSON_TYPE], JSON.stringify({ key: `key-cell-${cell.n}-a`, tier: 'standard', units: 1 })),
    D: () => withBody(port, 'POST', `/v1/reservations/${cell.x}/release`, [bearer(b)], ''),
    T: () => withBody(port, 'POST', '/v1/batch', [bearer(b), JSON_TYPE], JSON.stringify({ ops: [{ op: 'release', id: cell.x }] }))
  };
  const buffers = shape.parts.map((name, index) => {
    const bytes = parts[name]();
    return framing.version && (!framing.behindOnly || index > refusalAt) ? reframe(bytes, framing) : bytes;
  });
  const writes = shape.cut ? [Buffer.concat(buffers.slice(0, shape.cut)), Buffer.concat(buffers.slice(shape.cut))] : [Buffer.concat(buffers)];
  if (row.ids) await target.failIds(true);
  const { answers, closedByServer } = await exchange(port, writes);
  if (row.ids) await target.failIds(false);
  const earlier = shape.parts.slice(0, refusalAt);
  const expected = [...earlier.map(() => 200), row.status];
  const statuses = answers.map((answer) => answer.status);
  const problems = [];
  // A reset can discard answers the client has not read yet (Windows resets a connection closed with unread data in flight): after a second TCP
  // write, after the 20 KB header and when a timer ends a request whose body is still arriving the answers need only be what could still be read.
  const lenient = Boolean(shape.cut) || row.resets === true;
  if (lenient ? !isSubsequence(statuses, expected) : JSON.stringify(statuses) !== JSON.stringify(expected)) problems.push(`answers ${JSON.stringify(statuses)} instead of ${JSON.stringify(expected)}`);
  if (!closedByServer) problems.push('the server did not end the connection');
  const last = answers.at(-1);
  if (last && last.status === row.status && last.headers.connection !== 'close') problems.push('the refusal does not say Connection: close');
  // The effect, seen from ANOTHER connection: the key of A is replayed only when A ran; X is released only when D or T ran (before the refusal).
  const probe = await call(target, b, 'POST', '/v1/reservations', { key: `key-cell-${cell.n}-a`, tier: 'standard', units: 1 });
  const aRan = probe.status === 200 && probe.json.replayed === true;
  const state = (await call(target, b, 'GET', `/v1/reservations/${cell.x}`)).json.reservation.state;
  if (aRan !== earlier.includes('A')) problems.push(aRan ? 'a reserve behind the refusal ran' : 'a reserve before the refusal was lost');
  const released = earlier.includes('D') || earlier.includes('T');
  if (state !== (released ? 'released' : 'reserved')) problems.push(`the reservation is ${state}: ${released ? 'a release before the refusal was lost' : 'a release behind the refusal ran'}`);
  if (probe.status === 200 && !aRan) await call(target, b, 'POST', `/v1/reservations/${probe.json.reservation.id}/release`);
  return { problems, name: `${label(row)} [${shape.name}] ${framing.name}` };
}

const reserveAs = async (target, who, units, tier, key) => {
  const answer = await call(target, target.tokens[who], 'POST', '/v1/reservations', { key, tier, units });
  if (answer.status !== 200) throw new Error(`the setup of the matrix failed for ${who}: ${answer.text}`);
  return answer.json.reservation.id;
};
const releaseAs = (target, who, id) => call(target, target.tokens[who], 'POST', `/v1/reservations/${id}/release`);

// What a row needs around its cells: the other lease holds something (a foreign id, or the units that make a pool bound one request away), or the
// own lease already holds two others. Returns the foreign id and the ids to give back at the end of the row.
async function prepare(target, row, rowNumber) {
  const holds = { foreign: [1, 'standard'], a5: [5, 'standard'], a3burst: [3, 'burst'] };
  const held = [];
  let foreign = null;
  if (holds[row.prepare]) {
    foreign = await reserveAs(target, 'conductor-a', holds[row.prepare][0], holds[row.prepare][1], `key-row-${rowNumber}-a`);
    held.push(['conductor-a', foreign]);
  }
  if (row.prepare === 'fill') for (const n of [1, 2]) held.push(['conductor-b', await reserveAs(target, 'conductor-b', 1, 'standard', `key-row-${rowNumber}-f${n}`)]);
  return { foreign, held };
}

// A row: its own cells one after the other; every cell has a reservation X of its own (and the key a refusal clashes with), given back afterwards.
async function runRow(target, row, rowNumber) {
  if (row.code === 'IDEMPOTENCY_LIMIT_REACHED') {
    const { startTarget, startChildTarget } = require('./targets.cjs');
    const problems = [];
    let number = 0;
    for (const [shape, framing] of cellsOf(row)) {
      const current = target.app ? await startTarget('replay') : await startChildTarget('replay');
      try {
        const cell = { n: `${rowNumber}-${++number}`, foreign: null };
        cell.x = await reserveAs(current, 'conductor-b', 1, 'standard', `key-cell-${cell.n}-x`);
        for (const suffix of ['f1', 'f2']) {
          const id = await reserveAs(current, 'conductor-b', 1, 'standard', `key-cell-${cell.n}-${suffix}`);
          await releaseAs(current, 'conductor-b', id);
        }
        const result = await exchangeCell(current, row, shape, framing, cell);
        problems.push(...result.problems.map((problem) => `${result.name}: ${problem}`));
      } finally { await current.close(); }
    }
    return problems;
  }
  const { foreign, held } = await prepare(target, row, rowNumber);
  const found = [];
  let n = 0;
  for (const [shape, framing] of cellsOf(row)) {
    n += 1;
    const cell = { n: `${rowNumber}-${n}`, foreign };
    cell.x = await reserveAs(target, 'conductor-b', 1, 'standard', `key-cell-${cell.n}-x`);
    const own = [cell.x];
    if (row.prepare === 'key') own.push(await reserveAs(target, 'conductor-b', 1, 'standard', `key-cell-${cell.n}-k`));
    const done = await exchangeCell(target, row, shape, framing, cell);
    for (const id of own) await releaseAs(target, 'conductor-b', id);
    found.push(...done.problems.map((problem) => `${done.name}: ${problem}`));
  }
  for (const [who, id] of held) await releaseAs(target, who, id);
  return found;
}

// Every row of the config against one target (a server in this process or in a child); part = [k, n] takes every n-th row starting at k, so that
// a file holds a share of the matrix. Returns the number of cells and the problems found, one line per bad cell.
async function runMatrix(target, config, { part = [0, 1], rows = 4 } = {}) {
  const mine = ROWS.map((row, index) => [row, index]).filter(([row, index]) => (row.config || 'default') === config && index % part[1] === part[0]);
  let next = 0;
  const problems = [];
  await Promise.all(Array.from({ length: config === 'default' || config === 'timeout' ? rows : 1 }, async () => {
    while (next < mine.length) {
      const [row, index] = mine[next];
      next += 1;
      problems.push(...await runRow(target, row, index));
    }
  }));
  return { cells: mine.reduce((sum, [row]) => sum + cellsOf(row).length, 0), problems };
}

module.exports = Object.freeze({ BASIC, FRAMINGS, FULL, SHAPES, runMatrix });
