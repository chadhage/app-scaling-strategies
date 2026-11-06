'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const redact = require('../redact.cjs');
const { loadPage, settled, allText, HTML, IDS } = require('./dom-stub.cjs');
const { canaryList, seedConfig } = require('./canaries.cjs');
const { scan } = require('./scanner.cjs');

const ITEM = {
  trace: (i) => ({ seq: i, kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: 'ok', steps: [{ event: 'note', detail: 'x' }] }),
  runs: (i) => ({ id: `run-${String(i).padStart(4, '0')}`, units: i, owner: 'conductor-a', revision: i, status: 'ok', artifacts: 1, steps: [] }),
  audit: (i) => ({ seq: i, outcome: 'denied', code: 'ROLE_FORBIDDEN', command: 'run.create', subject: 'visitor', role: 'visitor' }),
  logs: (i) => ({ seq: i, level: 'warn', event: 'request', route: 'command', status: 403, code: 'ROLE_FORBIDDEN', role: 'visitor' })
};
const doc = (kind, count = 2, total = count) => ({ outcome: 'ok', kind, revision: 7, total, shown: count, limit: 50, items: Array.from({ length: count }, (_, index) => ITEM[kind](index + 1)) });
const answer = (body, status = 200) => ({ status, json: async () => body });
const serve = (make) => async (url) => answer(make(/\/v1\/evidence\/(\w+)\?limit=50$/.exec(url)[1]));
const run = async (fetch, options = {}) => {
  const loaded = loadPage({ fetch, ...options });
  await settled(loaded.document);
  return loaded;
};
const text = (loaded, id) => loaded.document.elements.get(id).textContent;

test('valid documents: every row is drawn from checked values, the count lines reconcile shown against total, and the status line adds them up', async () => {
  const requests = [];
  const loaded = await run(async (url, options) => { requests.push([url, options]); return answer(doc(/evidence\/(\w+)/.exec(url)[1], 2, 5)); });
  for (const kind of ['trace', 'runs', 'audit', 'logs']) {
    assert.equal(loaded.document.elements.get(`rows-${kind}`).children.length, 2, kind);
    assert.equal(text(loaded, `count-${kind}`), 'Showing 2 of 5 entries (limit 50); revision 7.');
    assert.equal(loaded.document.elements.get(`count-${kind}`).className, '');
  }
  assert.equal(text(loaded, 'status'), 'Loaded 4 of 4 sections: 8 of 20 entries shown.');
  assert.deepEqual(loaded.document.elements.get('rows-audit').children[0].children.map((cell) => cell.textContent), ['1', 'denied', 'ROLE_FORBIDDEN', 'run.create', 'visitor', 'visitor']);
  assert.deepEqual(loaded.document.elements.get('rows-trace').children[0].children.map((cell) => cell.textContent), ['1', 'request', 'GET', 'asset', '200', '\u2014', 'ok', '1']);
  assert.deepEqual(requests.map(([url]) => url).sort(), ['/v1/evidence/audit?limit=50', '/v1/evidence/logs?limit=50', '/v1/evidence/runs?limit=50', '/v1/evidence/trace?limit=50']);
  for (const [, options] of requests) assert.deepEqual([options.credentials, options.cache, options.referrerPolicy, typeof options.signal.aborted], ['omit', 'no-store', 'no-referrer', 'boolean']);
});

const FORGERIES = {
  'an extra field in the document': (kind) => ({ ...doc(kind), extra: 1 }),
  'another kind': (kind) => ({ ...doc(kind), kind: kind === 'trace' ? 'runs' : 'trace' }),
  'a limit that is not the one asked for': (kind) => ({ ...doc(kind), limit: 51 }),
  'shown that is not the number of items': (kind) => ({ ...doc(kind), shown: 1 }),
  'shown above total': (kind) => ({ ...doc(kind, 2, 1) }),
  'an outcome that is not ok': (kind) => ({ ...doc(kind), outcome: 'COMMAND_FAILED' }),
  'a negative revision': (kind) => ({ ...doc(kind), revision: -1 }),
  'items that are not an array': (kind) => ({ ...doc(kind), items: {} }),
  'an item with an extra field': (kind) => ({ ...doc(kind), items: [{ ...ITEM[kind](1), extra: 'x' }, ITEM[kind](2)] }),
  'an item that is null': (kind) => ({ ...doc(kind), items: [null, ITEM[kind](2)] }),
  'an item that is an array': (kind) => ({ ...doc(kind), items: [[], ITEM[kind](2)] }),
  'a word outside the vocabulary': (kind) => ({ ...doc(kind), items: [{ ...ITEM[kind](1), [{ trace: 'kind', runs: 'status', audit: 'outcome', logs: 'level' }[kind]]: 'EVERYTHING_IS_FINE' }, ITEM[kind](2)] }),
  'a number as text': (kind) => ({ ...doc(kind), items: [{ ...ITEM[kind](1), [{ trace: 'status', runs: 'units', audit: 'seq', logs: 'status' }[kind]]: '200' }, ITEM[kind](2)] })
};

test('forged documents are rejected whole with a fixed sentence: nothing of them is shown, the other sections still load', async () => {
  for (const [name, forge] of Object.entries(FORGERIES)) {
    const loaded = await run(serve((kind) => (kind === 'audit' ? forge(kind) : doc(kind))));
    assert.equal(loaded.document.elements.get('rows-audit').children.length, 0, name);
    assert.equal(text(loaded, 'count-audit'), 'Rejected: the answer did not match the closed shape and is not shown.', name);
    assert.equal(loaded.document.elements.get('count-audit').className, 'rejected');
    assert.equal(text(loaded, 'status'), 'Loaded 3 of 4 sections; 1 rejected. 6 of 6 entries shown from the sections that passed.', name);
    assert.equal(loaded.document.elements.get('rows-trace').children.length, 2, name);
  }
});

test('forged steps and runs are rejected too, each in a document whose counts are right so that only the forgery can reject it: an unknown event, a detail that is not text, a missing or an extra field, a bad id, a non-array, too many steps', async () => {
  const one = (kind, over) => ({ ...doc(kind, 1), items: [{ ...ITEM[kind](1), ...over }] });
  const step = (over = {}) => ({ event: 'note', detail: 'x', ...over });
  const bad = [
    { runs: one('runs', { steps: [step({ event: 'bogus' })] }) },
    { runs: one('runs', { steps: [step({ detail: 7 })] }) },
    { runs: one('runs', { steps: [{ event: 'note' }] }) },
    { runs: one('runs', { steps: [step({ extra: 1 })] }) },
    { runs: one('runs', { steps: [step(), step({ event: 'bogus' })] }) },
    { runs: one('runs', { id: 'run-1' }) },
    { runs: one('runs', { id: 'bad' }) },
    { runs: one('runs', { id: 5 }) },
    { runs: one('runs', { steps: Array.from({ length: 9 }, () => step()) }) },
    { trace: one('trace', { steps: 'x' }) },
    { trace: one('trace', { steps: 'abc' }) },
    { trace: one('trace', { steps: {} }) },
    { trace: one('trace', { steps: null }) },
    { runs: { ...doc('runs', 51) } }
  ];
  for (const forged of bad) {
    const [kind] = Object.keys(forged);
    const loaded = await run(serve((asked) => (asked === kind ? forged[kind] : doc(asked))));
    assert.equal(text(loaded, `count-${kind}`), 'Rejected: the answer did not match the closed shape and is not shown.', JSON.stringify(forged).slice(0, 80));
  }
});

test('the limits of a valid document are inclusive: eight steps, fifty items, zero counts, shown equal to total', async () => {
  const eight = { ...doc('runs', 1), items: [{ ...ITEM.runs(1), steps: Array.from({ length: 8 }, () => ({ event: 'note', detail: 'x' })) }] };
  const empty = { ...doc('trace', 0), revision: 0 };
  const loaded = await run(serve((kind) => ({ runs: eight, trace: empty, audit: doc('audit', 50), logs: { ...doc('logs', 3), total: 3 } })[kind]));
  assert.equal(text(loaded, 'count-runs'), 'Showing 1 of 1 entries (limit 50); revision 7.');
  assert.equal(loaded.document.elements.get('rows-runs').children[0].children.at(-1).textContent, '8', 'the steps cell shows the number of steps');
  assert.equal(text(loaded, 'count-trace'), 'Showing 0 of 0 entries (limit 50); revision 0.');
  assert.equal(text(loaded, 'count-audit'), 'Showing 50 of 50 entries (limit 50); revision 7.');
  assert.equal(loaded.document.elements.get('rows-audit').children.length, 50);
  assert.equal(text(loaded, 'status'), 'Loaded 4 of 4 sections: 54 of 54 entries shown.');
});

test('every request arms its own abort timer for ten seconds and clears it when the answer is in, so that no timer is left pending', async () => {
  const pending = new Map();
  let next = 1;
  const armed = [];
  const loaded = await run(serve((kind) => doc(kind)), {
    setTimeout: (callback, delay) => { const handle = next; next += 1; pending.set(handle, callback); armed.push(delay); return handle; },
    clearTimeout: (handle) => { pending.delete(handle); }
  });
  assert.equal(text(loaded, 'status'), 'Loaded 4 of 4 sections: 8 of 8 entries shown.');
  assert.deepEqual(armed, [10000, 10000, 10000, 10000], 'one ten-second deadline per section');
  assert.equal(pending.size, 0, 'every deadline was cleared once its answer was in');
});

test('an answer that is not the evidence document: another HTTP status, text that is not JSON, a refusal, a failed or a stalled request', async () => {
  const cases = [
    [async () => answer({ outcome: 'ROLE_FORBIDDEN' }, 403), 'Rejected: the server answered HTTP 403 instead of the evidence document.'],
    [async () => ({ status: 'abc', json: async () => ({}) }), 'Rejected: the server answered HTTP 0 instead of the evidence document.'],
    [async () => ({ status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } }), 'Rejected: the answer could not be read.'],
    [async () => { throw new TypeError('Failed to fetch'); }, 'Rejected: the answer could not be read.'],
    [async () => { throw null; }, 'Rejected: the answer could not be read.']
  ];
  for (const [fetch, expected] of cases) {
    const loaded = await run(fetch);
    for (const kind of ['trace', 'runs', 'audit', 'logs']) assert.equal(text(loaded, `count-${kind}`), expected);
    assert.equal(text(loaded, 'status'), 'Loaded 0 of 4 sections; 4 rejected. 0 of 0 entries shown from the sections that passed.');
  }
  const stalled = await run((url, { signal }) => new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort);
  }), { setTimeout: (callback) => { callback(); return 1; }, clearTimeout: () => {} });
  assert.equal(text(stalled, 'count-trace'), 'Rejected: no answer within 10 seconds.');
});

test('the page never prints a string the server sent: canaries in every free text and in every field of a forged document are nowhere in the DOM', async () => {
  const canaries = canaryList(seedConfig());
  const token = canaries[3].value;
  const stuffed = (kind) => ({ ...doc(kind), items: doc(kind).items.map((item) => ({ ...item, steps: item.steps === undefined ? undefined : [{ event: 'note', detail: `${token} ${canaries[5].value}` }], note: token })) });
  const loaded = await run(serve(stuffed));
  assert.equal(scan(allText(loaded.document), canaries).length, 0);
  assert.match(text(loaded, 'count-audit'), /^Rejected: /, 'a field no rule names makes the document invalid instead of being displayed');
  const valid = await run(serve((kind) => ({ ...doc(kind), items: doc(kind).items.map((item) => ({ ...item, steps: item.steps && [{ event: 'note', detail: `${token}` }] })) })));
  assert.equal(scan(allText(valid.document), canaries).length, 0, 'text inside steps is not shown either, only the number of steps');
  assert.equal(valid.document.elements.get('rows-trace').children[0].children.at(-1).textContent, '1');
});

test('Reload evidence loads everything again', async () => {
  let calls = 0;
  const loaded = await run(async (url) => { calls += 1; return answer(doc(/evidence\/(\w+)/.exec(url)[1])); });
  assert.equal(calls, 4);
  loaded.document.elements.get('reload').click();
  await new Promise((resolve) => setImmediate(resolve));
  await settled(loaded.document);
  assert.ok(calls >= 8);
});

test('the page vocabularies are the server vocabularies, field by field', async () => {
  const { page } = await run(async () => answer({}, 500));
  assert.deepEqual([...page.KINDS], redact.KINDS);
  assert.deepEqual([...page.ROLES], [...redact.ROLES]);
  assert.deepEqual([...page.SUBJECTS], redact.SUBJECTS);
  assert.deepEqual([...page.ROUTES], redact.ROUTE_CLASSES);
  assert.deepEqual([...page.COMMANDS], redact.COMMANDS);
  assert.deepEqual([...page.CODES], redact.CODE_LIST);
  assert.deepEqual([...page.EVENTS], ['dispatch', 'connect', 'response', 'failure', 'note']);
  for (const kind of redact.KINDS) assert.deepEqual(Object.keys(page.SHAPES[kind]), Object.keys(redact.SCHEMAS[kind].fields), `${kind}: the same fields in the same order`);
  for (const kind of redact.KINDS) assert.equal(page.validList(kind, doc(kind)), true);
  assert.equal(page.validList('trace', { ...doc('trace'), limit: 200 }), false);
});

test('the markup: no inline script or style, no event attribute, one polite live region, native controls, the download is the fixed GET', () => {
  assert.equal([...HTML.matchAll(/<script\b[^>]*>/g)].length, 1);
  assert.match(HTML, /<script src="\/page\.js"><\/script>/);
  assert.doesNotMatch(HTML, /<script>|\son[a-z]+=|\sstyle=|<style|javascript:/i);
  assert.equal([...HTML.matchAll(/aria-live="polite"/g)].length, 1);
  assert.match(HTML, /<p id="status" role="status" aria-live="polite">/);
  assert.match(HTML, /<a id="download" href="\/v1\/evidence\/bundle" download="c014-evidence-bundle\.json">/);
  assert.match(HTML, /<button id="reload" type="button">/);
  assert.equal(new Set(IDS).size, IDS.length, 'ids are unique');
  for (const kind of ['trace', 'runs', 'audit', 'logs']) assert.ok(IDS.includes(`rows-${kind}`) && IDS.includes(`count-${kind}`) && IDS.includes(`h-${kind}`));
  assert.equal([...HTML.matchAll(/aria-labelledby="h-(\w+)"/g)].length, 4);
});
