'use strict';

// Test tooling, not production code: the refusal rows and the pipelining cells of orders\_PIPELINING.md (including the third hole, [G][G][X]) for any server
// that speaks the C014 routes. Every cell is ONE TCP write (or two, a few milliseconds apart), in HTTP/1.1 and HTTP/1.0 framing; a cell passes when the client
// gets exactly the answers of the requests before the refusal, then the typed refusal, and the server ends the connection. Whether a mutation ran behind a
// refusal is decided by the number of runs afterwards (runs() is the caller's reader), batch by batch.
const { build, exchange, parseAnswers } = require('./harness.cjs');

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const auth = (token) => ({ Authorization: `Bearer ${token}` });

// One refusal request per refusal status the server can produce. `own` marks the answers Node decides itself (before any handler runs).
function refusalRows(port, tokens, version = '1.1') {
  const keep = version === '1.0' ? { Connection: 'keep-alive' } : {};
  const b = (method, target, options = {}) => build(method, target, { port, version, ...options, headers: { ...keep, ...options.headers } });
  const post = (token, body, extra = {}) => b('POST', '/v1/commands/run.create', { headers: { ...JSON_HEADERS, ...(token ? auth(token) : {}), ...extra }, body });
  const conductor = tokens['conductor-a'];
  return [
    { name: '401 no credential', status: 401, bytes: post(null, { name: 'a', units: 1 }) },
    { name: '401 forged token', status: 401, bytes: post(`c009_${'A'.repeat(43)}`, { name: 'a', units: 1 }) },
    { name: '401 malformed token', status: 401, bytes: b('GET', '/v1/evidence/runs', { headers: { Authorization: 'Bearer %%%' } }) },
    { name: '403 visitor', status: 403, bytes: post(tokens.visitor, { name: 'a', units: 1 }) },
    { name: '403 conductor on the management route', status: 403, bytes: b('GET', '/v1/manage/config', { headers: auth(conductor) }) },
    { name: '404 unknown command', status: 404, bytes: b('POST', '/v1/commands/nothing.here', { headers: { ...JSON_HEADERS, ...auth(tokens.operator) }, body: {} }) },
    { name: '400 bad command name', status: 400, bytes: b('POST', '/v1/commands/BAD', { headers: { ...JSON_HEADERS, ...auth(tokens.operator) }, body: {} }) },
    { name: '405 method', status: 405, bytes: b('PUT', '/v1/evidence/runs') },
    { name: '405 GET on a command', status: 405, bytes: b('GET', '/v1/commands/run.create') },
    { name: '400 invalid json (after the body is read)', status: 400, bytes: post(conductor, '{') },
    { name: '400 unknown field (after the body is read)', status: 400, bytes: post(conductor, { name: 'a', units: 1, extra: 1 }) },
    { name: '400 identity claim in the body', status: 400, bytes: post(conductor, { name: 'a', units: 1, role: 'operator' }) },
    { name: '415 media type', status: 415, bytes: b('POST', '/v1/commands/run.create', { headers: { 'Content-Type': 'text/plain', ...auth(conductor) }, body: 'x' }) },
    { name: '413 body too large', status: 413, bytes: post(conductor, `{"name":"${'a'.repeat(6000)}"}`) },
    { name: '414 URL too long', status: 414, bytes: b('GET', `/${'a'.repeat(3000)}`) },
    { name: '400 invalid URL fragment', status: 400, bytes: b('GET', '/scope.json#frag') },
    { name: '421 wrong host', status: 421, bytes: b('GET', '/scope.json', { host: 'example.invalid' }) },
    { name: '421 no Host header (Node would answer 400 itself)', status: 421, bytes: Buffer.from(`GET /scope.json HTTP/${version}\r\n${version === '1.0' ? 'Connection: keep-alive\r\n' : ''}\r\n`) },
    { name: '403 cross origin', status: 403, bytes: b('GET', '/scope.json', { headers: { Origin: 'http://evil.invalid' } }) },
    { name: '404 unknown route with a body', status: 404, bytes: b('POST', '/v1/nowhere', { headers: JSON_HEADERS, body: { x: 1 } }) },
    { name: '400 body on a read', status: 400, bytes: b('GET', '/scope.json', { headers: JSON_HEADERS, body: '{"a":1}' }) },
    { name: '400 query on an asset', status: 400, bytes: b('GET', '/page.js?x=1') },
    { name: '417 expectation (Node answers itself)', status: 417, own: true, http11: true, bytes: post(conductor, { name: 'a', units: 1 }, { Expect: 'nonsense' }) },
    { name: '417 expectation on a GET (Node answers itself)', status: 417, own: true, http11: true, bytes: b('GET', '/scope.json', { headers: { Expect: 'nonsense' } }) },
    { name: '431 headers too large (Node answers itself)', status: 431, own: true, bytes: b('GET', '/scope.json', { headers: { 'X-Big': 'b'.repeat(17000) } }) },
    { name: '405 CONNECT (Node answers itself)', status: 405, own: true, bytes: Buffer.from('CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n') },
    { name: '400 malformed request line (Node answers itself)', status: 400, own: true, bytes: Buffer.from('GARBAGE\r\n\r\n') }
  ].filter((row) => version === '1.1' || !row.http11); // Node honours Expect only in HTTP/1.1
}

const valid = (port, tokens, version) => build('POST', '/v1/commands/run.create', {
  port, version, headers: { ...JSON_HEADERS, ...auth(tokens['conductor-a']), ...(version === '1.0' ? { Connection: 'keep-alive' } : {}) }, body: { name: 'behind-a-refusal', units: 1 }
});
const get = (port, version) => build('GET', '/scope.json', { port, version, headers: version === '1.0' ? { Connection: 'keep-alive' } : {} });

// [name, pieces for (refusal, mutation, get), statuses before the refusal, applied mutations, gap between writes]
const POSITIONS = [
  ['[R]', (r) => [r], 0, 0, 0],
  ['[R][M]', (r, m) => [r, m], 0, 0, 0],
  ['[G][R][M]', (r, m, g) => [g, r, m], 1, 0, 0],
  ['[G][G][R][M]', (r, m, g) => [g, g, r, m], 2, 0, 0],
  ['[G][G][G][R]', (r, m, g) => [g, g, g, r], 3, 0, 0],
  ['[G][G][R][G]', (r, m, g) => [g, g, r, g], 2, 0, 0],
  ['[R] then [M] in a second write', (r, m) => [r, m], 0, 0, 8],
  ['[M][R]', (r, m) => [m, r], 1, 1, 0]
];

// Runs every cell of the chosen positions and framings. `runs` reads the number of runs the server holds. Returns the list of problems (empty when all hold).
async function runMatrix({ port, tokens, runs, positions = POSITIONS, framings = [['1.1', '1.1'], ['1.1', '1.0'], ['1.0', '1.1'], ['1.0', '1.0']], rowFilter = () => true, concurrency = 12 }) {
  const problems = [];
  for (const [label, arrange, before, applied, gapMs] of positions) {
    const cells = [];
    for (const [refusalVersion, mutationVersion] of framings) {
      for (const row of refusalRows(port, tokens, refusalVersion).filter(rowFilter)) cells.push({ row, refusalVersion, mutationVersion });
    }
    const start = await runs();
    for (let at = 0; at < cells.length; at += concurrency) {
      await Promise.all(cells.slice(at, at + concurrency).map(async ({ row, refusalVersion, mutationVersion }) => {
        const pieces = arrange(row.bytes, valid(port, tokens, mutationVersion), get(port, refusalVersion));
        const result = await exchange(port, gapMs ? pieces : [Buffer.concat(pieces)], { settleMs: 10000, gapMs });
        const statuses = parseAnswers(result.bytes).map((answer) => answer.status);
        const expected = [...Array(before).fill(200), row.status];
        const name = `${label} ${row.name} (R ${refusalVersion}, M ${mutationVersion})`;
        // Two writes: the second one can reset the connection before the client has read the answer (Windows loopback), so the answer may be missing but never different.
        const fine = gapMs ? statuses.length === 0 || JSON.stringify(statuses) === JSON.stringify(expected) : JSON.stringify(statuses) === JSON.stringify(expected);
        if (!fine) problems.push(`${name}: answers ${JSON.stringify(statuses)}, expected ${JSON.stringify(expected)}`);
        if (!result.closed) problems.push(`${name}: the connection stayed open`);
      }));
    }
    const ran = (await runs()) - start;
    if (ran !== applied * cells.length) problems.push(`${label}: ${ran} runs applied, expected ${applied * cells.length} (a mutation ran behind a refusal, or an earlier one was lost)`);
  }
  return problems;
}

module.exports = Object.freeze({ refusalRows, runMatrix, POSITIONS, valid, get });
