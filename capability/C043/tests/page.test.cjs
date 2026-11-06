'use strict';

// The page script, run under a DOM stub built from the real index.html against the REAL service over real sockets:
// keyboard-operable form, validated answers with wording derived from facts, forged answers rejected, rendered-DOM
// invariants after every action.
const test = require('node:test');
const { produceTranscript } = require('../transcript.cjs');
const { createDocument, networkFetch, runPage } = require('./dom-stub.cjs');
const {
  assert, clock, doc, gate, inFlight, startService, step, text,
} = require('./support.cjs');

const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label) {
  for (let turn = 0; turn < 500; turn += 1) { if (await check()) return; await wait(10); }
  assert.fail(`never held: ${label}`);
}

async function open(service, fetchFor = networkFetch) {
  const page = runPage({ fetch: fetchFor(service.port) });
  await until(() => /declared presets loaded|REJECTED/.test(page.document.element('catalog-status').textContent), 'the declared presets were loaded');
  return page;
}

const choose = async (document, value) => { document.element('preset').value = value; await document.element('preset').dispatch('change'); };
const run = (document) => document.element('run-form').dispatch('submit');
const status = (document) => document.element('status').textContent;
const labels = (document) => document.element('recovery').labels();
const rows = (document) => document.element('result').children.filter((child) => child.tagName === 'dd').map((child) => child.textContent);

test('the page loads the declared presets, runs one with the keyboard path and shows validated progress, listing and controls', { timeout: 60000 }, async () => {
  const service = await startService();
  try {
    const { document } = await open(service);
    assert.equal(document.element('submit').disabled, false);
    assert.equal(document.element('preset').children.length, 4 + 9);
    assert.equal(document.element('preset').children[0].textContent, 'Declared preset: three-small-reservations');
    await choose(document, 'catalog:0');
    assert.match(document.element('request').value, /demo-preset-0001/);
    const event = await run(document);
    assert.equal(event.prevented, true, 'Enter on the submit button never reloads the page');
    assert.match(status(document), /^COMPLETED — all 3 steps succeeded within the bounds; 3 effect\(s\) stand \(15 units\); nothing was undone\./);
    assert.deepEqual(document.element('progress').lines().map((line) => line.split(' · ')[0]), ['Step 1', 'Step 2', 'Step 3']);
    assert.equal(document.element('progress').children.every((row) => /succeeded$/.test(row.textContent)), true);
    assert.equal(rows(document)[0], '201');
    assert.deepEqual(labels(document), ['Retry with the same key', 'Inspect the preset']);
    assert.equal(document.element('listing-effects').children.length, 3);
    assert.deepEqual(document.element('trail').lines().map((line) => line.split(' ')[1]), ['begin', 'start', 'step', 'start', 'step', 'start', 'step', 'end']);
    await document.element('recovery').buttons()[0].click();
    assert.equal(rows(document)[0], '200');
    assert.equal(rows(document)[5], 'true', 'the retry is a replay');
    assert.match(status(document), /^COMPLETED/);
    await document.element('key').dispatch('click');
    document.element('key').value = 'demo-preset-0001';
    await document.element('inspect').click();
    assert.equal(rows(document)[1], 'inspect');
    document.element('key').value = 'bad';
    await document.element('inspect').click();
    assert.match(status(document), /Enter a valid preset key/);
    document.element('key').value = 'unknown-preset-001';
    await document.element('inspect').click();
    assert.match(status(document), /^REJECTED — RUN_NOT_FOUND; nothing was run and nothing was written\./);
    assert.deepEqual(labels(document), ['Correct and resubmit']);
    await document.element('recovery').buttons()[0].click();
    assert.equal(document.active, document.element('request'), 'correct-and-resubmit moves the focus to the editable request');
    assert.match(status(document), /Edit the preset/);
  } finally {
    await service.stop();
  }
});

test('a refused step, a static bound and a duration bound are shown from facts, with only the controls that work', { timeout: 60000 }, async (context) => {
  const clk = clock();
  const service = await startService({ clk, executor: async () => { clk.advance(5000); } });
  try {
    const { document } = await open(service);
    await context.test('the small lease refuses step 2', async () => {
      await choose(document, 'catalog:1');
      await run(document);
      assert.match(status(document), /^STOPPED at a step that did not succeed — step 2 of 3 did not succeed \(CAPACITY_EXHAUSTED\); 1 step\(s\) were not run; 1 effect\(s\) stand \(6 units\); nothing was undone\./);
      assert.deepEqual(document.element('listing-notrun').lines(), ['Step 3 (demo-p2-step-3)']);
      assert.deepEqual(labels(document), ['Correct and resubmit', 'Inspect the preset']);
      assert.deepEqual(document.element('details').lines(), ['steps[1]: CAPACITY_EXHAUSTED']);
    });
    await context.test('a static bound refuses before any step', async () => {
      await choose(document, 'catalog:2');
      await run(document);
      assert.match(status(document), /^BOUND EXCEEDED — the maximum number of synthetic units is 25 but the preset declares 30; nothing was run or written\./);
      assert.deepEqual(labels(document), ['Correct and resubmit']);
      assert.equal(document.element('listing-ran').children.length, 0);
    });
    await context.test('the duration bound on the injected clock stops between steps', async () => {
      await choose(document, 'catalog:3');
      await run(document);
      assert.match(status(document), /^BOUND EXCEEDED — the maximum duration \(ms\) is 1 but 5000 was used; 2 step\(s\) were not run; 1 effect\(s\) stand \(5 units\); nothing was undone\./);
      assert.deepEqual(labels(document), ['Correct and resubmit', 'Inspect the preset']);
    });
  } finally {
    await service.stop();
  }
});

const EXAMPLES = [
  ['example:valid', /^COMPLETED/], ['example:conflict', /^REJECTED — IDEMPOTENCY_KEY_CONFLICT/ ], ['example:duplicate', /^REJECTED — DUPLICATE_FIELD; nothing was run/],
  ['example:prototype', /^REJECTED — FORBIDDEN_FIELD/], ['example:version', /^UNSUPPORTED — UNSUPPORTED_PRESET_VERSION/], ['example:many', /^REJECTED — TOO_MANY_STEPS/],
  ['example:last', /^REJECTED — FIELD_OUT_OF_RANGE/], ['example:twin', /^REJECTED — DUPLICATE_STEP_KEY/], ['example:units', /^BOUND EXCEEDED — the maximum number of synthetic units is 14 but the preset declares 15/],
];

test('every built-in example, including the hostile ones, is a typed answer the page shows from facts', { timeout: 120000 }, async () => {
  const service = await startService();
  try {
    const { document } = await open(service);
    for (const [value, pattern] of EXAMPLES) {
      await choose(document, value);
      await run(document);
      assert.match(status(document), pattern, value);
    }
    assert.match(status(document), /BOUND EXCEEDED/);
  } finally {
    await service.stop();
  }
});

test('an interrupted preset offers resume and cancel, and both are real requests', { timeout: 60000 }, async () => {
  let failures = 1;
  const service = await startService({ executor: async ({ key }) => { if (key === 'demo-p1-step-2' && failures > 0) { failures -= 1; throw new Error('synthetic'); } } });
  try {
    const { document } = await open(service);
    await choose(document, 'catalog:0');
    await run(document);
    assert.match(status(document), /^INTERRUPTED \(not finished\) — step 2 of 3 is interrupted \(STEP_INTERRUPTED\); 1 step\(s\) were not run; 1 effect\(s\) stand/);
    assert.deepEqual(labels(document), ['Resume the preset', 'Cancel the preset', 'Inspect the preset']);
    await document.element('recovery').buttons()[0].click();
    assert.match(status(document), /^COMPLETED/);
    assert.equal(rows(document)[1], 'resume');
    failures = 1;
    await choose(document, 'example:valid');
    document.element('request').value = text(doc({ idempotencyKey: 'page-run-0002', steps: [step(1, { idempotencyKey: 'demo-p1-step-2' }), step(2, { idempotencyKey: 'page-step-0002' })] }));
    await run(document);
    assert.match(status(document), /^COMPLETED/);
  } finally {
    await service.stop();
  }
  const cancelling = await startService({ executor: async ({ key }) => { if (key === 'demo-p1-step-2') throw new Error('synthetic'); } });
  try {
    const { document } = await open(cancelling);
    await choose(document, 'catalog:0');
    await run(document);
    await document.element('recovery').buttons()[1].click();
    assert.match(status(document), /^CANCELLED — step 2 of 3 is cancelled/);
    assert.deepEqual(labels(document), ['Correct and resubmit', 'Inspect the preset']);
  } finally {
    await cancelling.stop();
  }
});

test('while a preset runs the page polls with a read-only GET and shows the steps acknowledged so far', { timeout: 60000 }, async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const page = await open(service);
    const { document, timers } = page;
    await choose(document, 'catalog:0');
    const running = run(document);
    await inFlight(held, 'demo-p1-step-1', [running]);
    held.release('demo-p1-step-1');
    await inFlight(held, 'demo-p1-step-2', [running]);
    assert.equal(timers.count(), 1, 'one progress poll is scheduled');
    await timers.fire();
    assert.deepEqual(document.element('progress').children.map((row) => row.className), ['status-succeeded', 'status-running', 'status-not-run']);
    assert.equal(document.element('status').textContent, 'Waiting for the server…');
    held.release('demo-p1-step-2');
    await inFlight(held, 'demo-p1-step-3', [running]);
    held.release('demo-p1-step-3');
    await running;
    assert.equal(timers.count(), 0, 'the poll stops with the final answer');
    assert.match(status(document), /^COMPLETED/);
  } finally {
    await service.stop();
  }
});

const forge = (change, statusChange) => (port) => {
  const inner = networkFetch(port);
  return async (route, options) => {
    const response = await inner(route, options);
    if (!route.startsWith('/v1/presets')) return response;
    const body = await response.json();
    if (body.kind === 'C043-preset-result') change(body);
    const forgedStatus = statusChange ? statusChange(response.status) : response.status;
    return { status: forgedStatus, ok: forgedStatus >= 200 && forgedStatus < 300, json: async () => body };
  };
};

const FORGED = [
  ['success claimed for a failed run', (b) => { if (b.run.state === 'stopped') { b.outcome = 'succeeded'; b.classification = 'COMPLETED'; b.error = null; } }, 1],
  ['an accepted flag that is flipped', (b) => { b.accepted = !b.accepted; }, 0],
  ['an effect removed from the listing', (b) => { b.effects.pop(); }, 0],
  ['recovery prose rewritten', (b) => { b.recovery.reason = 'Everything is fine, nothing to do.'; }, 0],
  ['what-did-not wording rewritten', (b) => { b.didNot[0].text = 'Nothing happened at all.'; }, 0],
  ['an error message rewritten', (b) => { if (b.error) b.error.message = 'Cosmetic issue only.'; else b.steps[0].status = 'failed'; }, 0],
  ['a step status rewritten', (b) => { b.steps[0].status = 'not-run'; }, 0],
  ['a controls list widened', (b) => { b.recovery.allowed = ['cancel', 'resume', 'retry', 'inspect', 'correct-and-resubmit']; }, 0],
  ['the preset swapped', (b) => { if (b.preset) b.preset.steps[0].units = 9; }, 0],
  ['a bound hidden', (b) => { b.bound = null; }, 2],
];

test('a tampered state, result or failure is rejected and never shown as success', { timeout: 120000 }, async () => {
  const service = await startService();
  try {
    const [name, change, preset] = FORGED[0];
    const { document } = await open(service, forge(change));
    await choose(document, `catalog:${preset}`);
    await run(document);
    assert.match(status(document), /^REJECTED — the response is not a valid C043 result/, name);
    assert.equal(document.element('result').children.length, 0, `${name}: nothing is shown`);
    assert.equal(document.element('progress').children.length, 0, name);
    assert.equal(document.element('recovery').textContent, 'No result yet.', name);
  } finally {
    await service.stop();
  }
});

test('every forged shape is rejected by its own rule, including a dishonest HTTP status and a swapped preset', { timeout: 120000 }, async () => {
  for (const [index, [name, change, preset]] of FORGED.entries()) {
    const service = await startService();
    try {
      const { document } = await open(service, forge(change));
      await choose(document, `catalog:${preset}`);
      await run(document);
      const text = status(document);
      assert.equal(/^(COMPLETED|STOPPED|BOUND|CANCELLED|INTERRUPTED)/.test(text) && !/^REJECTED/.test(text) ? name : 'rejected', 'rejected', `${index}: ${name} was shown as ${text}`);
    } finally {
      await service.stop();
    }
  }
  const service = await startService();
  try {
    const dishonest = await open(service, forge(() => {}, () => 200));
    await choose(dishonest.document, 'catalog:0');
    await run(dishonest.document);
    assert.match(status(dishonest.document), /HTTP_STATUS_CONTRADICTS_ENVELOPE/);
  } finally {
    await service.stop();
  }
});

test('a missing, malformed or failing answer is UNKNOWN, a malformed catalog is rejected, and nothing is shown as success', { timeout: 60000 }, async (context) => {
  const service = await startService();
  const failing = (mode) => (port) => {
    const inner = networkFetch(port);
    return async (route, options) => {
      if (route === '/v1/presets' && options?.method === 'POST' && mode === 'network') throw new Error('offline');
      const response = await inner(route, options);
      if (route.startsWith('/v1/presets/') && mode === 'inspect') throw new Error('offline');
      if (route === '/v1/presets' && !options?.method && mode === 'catalog') return { status: 200, ok: true, json: async () => ({ kind: 'nothing' }) };
      if (route === '/v1/presets' && !options?.method && mode === 'catalog-bytes') return { status: 200, ok: true, json: async () => { throw new SyntaxError('bad'); } };
      if (route === '/v1/presets' && options?.method === 'POST' && mode === 'malformed') return { status: 201, ok: true, json: async () => { throw new SyntaxError('bad'); } };
      return response;
    };
  };
  try {
    await context.test('the network fails: UNKNOWN, with retry and inspect for a known key', async () => {
      const { document } = await open(service, failing('network'));
      await choose(document, 'catalog:0');
      await run(document);
      assert.match(status(document), /^UNKNOWN — no valid response was received/);
      assert.equal(document.element('result').children.length, 0);
      assert.deepEqual(labels(document), ['Retry with the same key', 'Inspect the preset']);
      await document.element('recovery').buttons()[0].click();
      assert.match(status(document), /^UNKNOWN/);
      await document.element('recovery').buttons()[1].click();
      assert.match(status(document), /^COMPLETED|^REJECTED — RUN_NOT_FOUND/);
    });
    await context.test('a request without a valid key offers no control', async () => {
      const { document } = await open(service, failing('network'));
      document.element('request').value = '{not json';
      await run(document);
      assert.match(status(document), /^UNKNOWN/);
      assert.equal(document.element('recovery').textContent, 'No recovery control is offered for this result.');
    });
    await context.test('a malformed answer is UNKNOWN', async () => {
      const { document } = await open(service, failing('malformed'));
      await choose(document, 'catalog:0');
      await run(document);
      assert.match(status(document), /^UNKNOWN/);
    });
    await context.test('a failing inspect after a known run is UNKNOWN with only inspect', async () => {
      const { document } = await open(service, failing('inspect'));
      document.element('key').value = 'demo-preset-0001';
      await document.element('inspect').click();
      assert.match(status(document), /^UNKNOWN/);
      assert.deepEqual(labels(document), ['Inspect the preset']);
    });
    for (const mode of ['catalog', 'catalog-bytes']) {
      await context.test(`a ${mode} that does not validate leaves only the built-in examples`, async () => {
        const { document } = await open(service, failing(mode));
        assert.match(document.element('catalog-status').textContent, /^REJECTED — the declared presets could not be loaded or did not validate/);
        assert.equal(document.element('preset').children.length, 9);
      });
    }
  } finally {
    await service.stop();
  }
});

test('the server-produced transcript is verified again by the page and a forged one is rejected', { timeout: 120000 }, async (context) => {
  const service = await startService({ transcript: produceTranscript });
  try {
    await context.test('a genuine transcript', async () => {
      const { document } = await open(service);
      await document.element('load').click();
      assert.match(document.element('summary').textContent, /^VERIFIED SERVER TRANSCRIPT/);
      assert.match(status(document), /^VERIFIED — \d+ exchanges, one effect per step, ledger totals reconciled\./);
      assert.equal(document.element('events').children.length >= 25, true);
      assert.equal(document.element('events').children.some((row) => /preset-run|bound-exceeded/.test(row.children[4].textContent)), true);
    });
    await context.test('a forged transcript', async () => {
      const forgedFetch = (port) => {
        const inner = networkFetch(port);
        return async (route, options) => {
          const response = await inner(route, options);
          if (route !== '/transcript.json') return response;
          const body = await response.json();
          body.events.find((event) => event.kind === 'exchange' && event.response.body.outcome === 'failed').response.body.outcome = 'succeeded';
          return { status: 200, ok: true, json: async () => body };
        };
      };
      const { document } = await open(service, forgedFetch);
      await document.element('load').click();
      assert.match(document.element('summary').textContent, /^REJECTED — ENVELOPE_INVALID/);
      assert.equal(document.element('events').children.length, 0);
      assert.match(status(document), /^REJECTED — the transcript did not verify/);
    });
    await context.test('an unavailable or unreadable transcript', async () => {
      const bare = await startService();
      try {
        const { document } = await open(bare);
        await document.element('load').click();
        assert.match(document.element('summary').textContent, /^REJECTED — TRANSCRIPT_UNAVAILABLE/);
        const offline = runPage({ fetch: async () => { throw new Error('offline'); } });
        await offline.document.element('load').click();
        assert.match(offline.document.element('summary').textContent, /^REJECTED — the transcript could not be loaded/);
        assert.match(status(offline.document), /^UNKNOWN — the transcript could not be loaded/);
      } finally {
        await bare.stop();
      }
    });
  } finally {
    await service.stop();
  }
  assert.equal(typeof createDocument, 'function');
});
