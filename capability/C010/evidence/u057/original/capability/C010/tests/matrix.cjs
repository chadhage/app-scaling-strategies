'use strict';

// Test tooling, not production code: the pipelining matrix (rev-C009 F1b, rev-C017 F11 and F12, rev-C059 N1). One raw TCP socket sends several
// requests, the refusal R of a row of rows.cjs somewhere in the middle. Whatever stands behind R must never run, whatever stands before it is
// answered once and in order, and the server ends the connection. G is an authorized GET of a run, M6 and M7 are authorized PATCHes of its units
// (the effect is visible), a shape with a cut sends its bytes in two TCP writes. Two and three requests BEFORE the refusal are shapes of their
// own (a lane that drops its queue when a Node-own answer is decided at parse time loses the earlier ones and never closes: C059 N1).
// A row shares one lease; every cell has its own run, and the runs of the row are read back with ONE list call (the cost of a cell is its own
// connection, because on a loaded machine the cost of the whole file decides whether it fits the per-file time cap).
const { call } = require('./helpers.cjs');
const { bare, bearer, exchange, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { ROWS, label } = require('./rows.cjs');

const SHAPES = Object.freeze([
  { name: 'R M7', parts: ['R', 'M7'] }, { name: 'M6 R M7', parts: ['M6', 'R', 'M7'] }, { name: 'G G R M7', parts: ['G', 'G', 'R', 'M7'] },
  { name: 'G G G R', parts: ['G', 'G', 'G', 'R'] }, { name: 'G G R G', parts: ['G', 'G', 'R', 'G'] }, { name: 'M6 G R', parts: ['M6', 'G', 'R'] },
  { name: 'R | M7', parts: ['R', 'M7'], cut: 1 }, { name: 'G R | M7', parts: ['G', 'R', 'M7'], cut: 2 }
]);
// Every row runs the three shapes that matter most (nothing behind a refusal, two earlier requests, a mutation before and a GET between); one
// row per refusal PATH runs all eight: the decisions made before any await (credential, role, target), after one (a body), at the commit (quota,
// conflict), and what Node answers itself.
const BASIC = Object.freeze(['R M7', 'G G R M7', 'M6 G R']);
const FULL = new Set(['TOKEN_EXPIRED', 'ROLE_FORBIDDEN', 'TARGET_NOT_FOUND', 'BODY_TOO_LARGE', 'INPUT_INVALID', 'OWNER_QUOTA_FULL', 'STATE_CONFLICT', 'METHOD_NOT_ALLOWED', 'URL_TOO_LONG',
  'EXPECTATION_FAILED', 'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'UNEXPECTED_BODY']);
// The HTTP/1.0 framings run for one row per refusal path as well (the version logic does not depend on which code the row answers with).
const V10 = new Set(['TOKEN_EXPIRED', 'ROLE_FORBIDDEN', 'TARGET_NOT_FOUND', 'BODY_TOO_LARGE', 'INPUT_INVALID', 'STATE_CONFLICT', 'OWNER_QUOTA_FULL', 'URL_TOO_LONG', 'METHOD_NOT_ALLOWED',
  'QUERY_REJECTED', 'INTERNAL_ERROR', 'LOCAL_HOST_REQUIRED', 'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'EXPECTATION_FAILED']);
// Node applies maxRequestsPerSocket to HTTP/1.1 only, so nothing here may depend on it: every request HTTP/1.0 with keep-alive, or the refusal
// and what stands before it HTTP/1.1 and what stands behind it plain HTTP/1.0 (which Node answers with a close). A shape never holds more than
// four requests: the lanes cut a client that has more than that in flight (README, limits), which is a bound and not a refusal.
const FRAMINGS = Object.freeze([
  { name: 'HTTP/1.1', version: null },
  { name: 'HTTP/1.0 keep-alive', version: 'HTTP/1.0', keepAlive: true, shapes: ['R M7', 'G G R M7', 'M6 G R'] },
  { name: 'refusal then HTTP/1.0', version: 'HTTP/1.0', keepAlive: false, behindOnly: true, shapes: ['R M7', 'G G R M7', 'G G R G'] }
]);

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

// C010_MATRIX_ONLY selects cells for the mutation run: a regular expression over "<row> [<shape>] <framing>".
const ONLY = process.env.C010_MATRIX_ONLY ? new RegExp(process.env.C010_MATRIX_ONLY) : null;
const cellsOf = (row) => SHAPES.flatMap((shape) => FRAMINGS.map((framing) => [shape, framing])).filter(([shape, framing]) => !row.skips?.includes(framing.name)
  && (framing.version === null || V10.has(row.code)) && (framing.shapes ? framing.shapes.includes(shape.name) : FULL.has(row.code) || BASIC.includes(shape.name))
  && (ONLY === null || ONLY.test(`${label(row)} [${shape.name}] ${framing.name}`)));

// One cell: the bytes of the shape in the framing, the answers, whether the server ended the connection; returns what is needed to judge the effect.
async function exchangeCell(target, row, shape, framing, lease, run, run2) {
  const { port, tokens } = target;
  const b = tokens['conductor-b'];
  const ctx = { port, tokens, lease, run, run2, foreign: target.foreign };
  const refusalAt = shape.parts.indexOf('R');
  const buffers = shape.parts.map((name, index) => {
    const bytes = name === 'R' ? row.request(ctx)
      : name === 'G' ? bare(port, 'GET', `/v1/leases/${lease}/runs/${run}`, [bearer(b)])
        : withBody(port, 'PATCH', `/v1/leases/${lease}/runs/${run}`, [bearer(b), JSON_TYPE], JSON.stringify({ units: Number(name.slice(1)) }));
    return framing.version && (!framing.behindOnly || index > refusalAt) ? reframe(bytes, framing) : bytes;
  });
  const writes = shape.cut ? [Buffer.concat(buffers.slice(0, shape.cut)), Buffer.concat(buffers.slice(shape.cut))] : [Buffer.concat(buffers)];
  const { answers, closedByServer } = await exchange(port, writes);
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
  return { problems, wanted: earlier.includes('M6') ? 6 : 5, name: `${label(row)} [${shape.name}] ${framing.name}` };
}

const unitsOf = async (target, lease) => new Map((await call(target, target.tokens['conductor-b'], 'GET', `/v1/leases/${lease}/runs?limit=50`)).json.items.map((item) => [item.id, item.units]));

// A row: ONE lease for all its cells (a quota row needs a lease, a run and a scratch of its own per cell, because its share is three).
async function runRow(target, row) {
  const b = target.tokens['conductor-b'];
  const cells = cellsOf(row);
  const found = [];
  if (row.setup === 'fill') {
    for (const [shape, framing] of cells) {
      const lease = (await call(target, b, 'POST', '/v1/leases', { name: 'cell', ttlMs: 600000 })).json.lease.id;
      const run = (await call(target, b, 'POST', `/v1/leases/${lease}/runs`, { name: 'cell', units: 5 })).json.resource.id;
      await call(target, b, 'POST', `/v1/leases/${lease}/scratches`, { name: 'fill' });
      const cell = await exchangeCell(target, row, shape, framing, lease, run);
      const units = (await unitsOf(target, lease)).get(run);
      if (units !== cell.wanted) cell.problems.push(`the run has ${units} units instead of ${cell.wanted}: a request behind the refusal ran`);
      await call(target, b, 'DELETE', `/v1/leases/${lease}`);
      found.push(...cell.problems.map((problem) => `${cell.name}: ${problem}`));
    }
    return found;
  }
  const lease = (await call(target, b, 'POST', '/v1/leases', { name: 'row', ttlMs: 600000 })).json.lease.id;
  let run2;
  if (row.setup === 'cancelled') {
    run2 = (await call(target, b, 'POST', `/v1/leases/${lease}/runs`, { name: 'second', units: 1 })).json.resource.id;
    await call(target, b, 'POST', `/v1/leases/${lease}/runs/${run2}/cancel`);
  }
  const done = await Promise.all(cells.map(async ([shape, framing]) => {
    const run = (await call(target, b, 'POST', `/v1/leases/${lease}/runs`, { name: 'cell', units: 5 })).json.resource.id;
    return { run, ...(await exchangeCell(target, row, shape, framing, lease, run, run2)) };
  }));
  const units = await unitsOf(target, lease);
  for (const cell of done) {
    if (units.get(cell.run) !== cell.wanted) cell.problems.push(`the run has ${units.get(cell.run)} units instead of ${cell.wanted}: a request behind the refusal ran`);
    found.push(...cell.problems.map((problem) => `${cell.name}: ${problem}`));
  }
  return found;
}

// Every row of the config against one target (a server in this process or in a child); part = [k, n] takes every n-th row starting at k, so that
// a file holds a share of the matrix. Returns the number of cells and the problems found, one line per bad cell.
async function runMatrix(target, config, { part = [0, 1], rows = 4 } = {}) {
  const shared = { port: target.port, tokens: target.tokens };
  shared.foreign = (await call(shared, target.tokens['conductor-a'], 'POST', '/v1/leases', { name: 'foreign', ttlMs: 600000 })).json.lease.id;
  const mine = ROWS.filter((candidate, index) => (candidate.config || 'default') === config && index % part[1] === part[0]);
  let next = 0;
  const problems = [];
  await Promise.all(Array.from({ length: config === 'quota' ? 1 : rows }, async () => {
    while (next < mine.length) problems.push(...await runRow(shared, mine[next++]));
  }));
  return { cells: mine.reduce((sum, row) => sum + cellsOf(row).length, 0), problems };
}

module.exports = Object.freeze({ BASIC, FRAMINGS, FULL, SHAPES, runMatrix });
