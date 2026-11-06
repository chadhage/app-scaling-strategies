'use strict';

// RED snapshot of tests\pipelining.test.cjs (the final matrix) for the controller addition: EVERY refusal closes the connection and nothing later on it
// runs, including the answers Node gives by itself (417, no Host, clientError, 100-continue) and the HTTP/1.0 framing (a valid mutation written as
// HTTP/1.0 behind a refusal: maxRequestsPerSocket does not apply to it). Reduced for the run against the service AS PUBLISHED in 14cefdea, which keeps
// every connection open for its one second keep-alive bound: all four framing pairs for the [refusal][submit] shape, the [GET][refusal][submit] shape
// for HTTP/1.1 only. Raw sockets against the service in a SEPARATE process, ONE write per case unless stated.
// Replay: C059_RED_SUBJECT=capability\C059\evidence\red\stubs-4 (old), unset (the final code).
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { call, settleTurn, startService, until } = require('./helpers-6/net.cjs');
const { JSON_TYPE, ROWS, bare, chunkedBody, chunkedHead, disposeShared, exchange, scenario, withBody } = require('./helpers-6/pipelining-support.cjs');

const OPTIONS = { timeout: 60000 };
const FRAMINGS = [['1.1', '1.1'], ['1.0', '1.0'], ['1.1', '1.0'], ['1.0', '1.1']];
test.after(disposeShared);

// What the client must have received: the leading answers, then the typed refusal (nothing for a request Node drops silently).
function verify(answers, item, lead = [], closeDelimited = false) {
  const wanted = [...lead, ...(item.status === null ? [] : [item.status])];
  if (item.lenient) {
    assert.ok(answers.length <= wanted.length && answers.every((answer, index) => answer.status === wanted[index]), `${item.name}: ${JSON.stringify(answers)}`);
  } else if (closeDelimited) {
    // A request in HTTP/1.0 framing without keep-alive ends its connection: every byte behind it is data after Connection: close, which Node rejects
    // itself (clientError). The service answers that on the one refusal path with the typed 400; the refusal's own answer comes first when it was
    // already decided and is lost to that answer when it was still being produced. What never happens: an answer to the request behind it.
    assert.deepEqual(answers.slice(0, lead.length).map((answer) => answer.status), lead, item.name);
    const tail = answers.slice(lead.length);
    assert.ok(tail.length >= 1 && tail.length <= 2, `${item.name}: ${JSON.stringify(answers)}`);
    for (const answer of tail) {
      assert.ok([item.status, 400].includes(answer.status) && [item.code, 'MALFORMED_REQUEST'].includes(answer.code) && answer.close === true, `${item.name}: ${JSON.stringify(answer)}`);
    }
  } else {
    assert.deepEqual(answers.map((answer) => answer.status), wanted, item.name);
    assert.equal(answers.at(-1).code, item.code, 'the refusal is typed by the service, not answered by Node');
    assert.equal(answers.at(-1).close, true, 'the refusal says Connection: close');
  }
  assert.equal(answers.interim, item.interim ?? 0, 'the interim 100 Continue is sent for a request that started, never for one that was dropped');
}

for (const item of ROWS) {
  for (const [vr, vm] of FRAMINGS) {
    if ((item.only11 || item.fixedVersion) && vr === '1.0') continue;
    const label = `[${item.name}] R=HTTP/${vr} M=HTTP/${vm}`;
    test(`pipelined ${label}: [refusal][valid submit] in ONE write, the submit never runs`, OPTIONS, async () => {
      await scenario(async ({ port, submit, observe, before }) => {
        verify(await exchange(port, [item.make(port, vr), submit({}, JSON_TYPE, vm)]), item, [], vr === '1.0');
        assert.deepEqual(await observe(), before, 'the ledger, the journal revision and the step are unchanged');
      });
    });
    if (vr === '1.0' || vm === '1.0') continue;
    test(`pipelined ${label}: [valid GET][refusal][valid submit] in ONE write, the GET and the refusal are answered, the submit never runs`, OPTIONS, async () => {
      await scenario(async ({ port, submit, observe, before }) => {
        verify(await exchange(port, [bare(port, '/scope.json'), item.make(port, vr), submit({}, JSON_TYPE, vm)]), item, [200], vr === '1.0');
        assert.deepEqual(await observe(), before);
      });
    });
  }
}

for (const item of ROWS.filter((row) => !row.lenient && !/clientError|checkContinue|chunk/.test(row.name)).slice(0, 8)) {
  for (const [vr, vm] of [['1.1', '1.1'], ['1.0', '1.0']]) {
    test(`pipelined in TWO writes [${item.name}] R=HTTP/${vr} M=HTTP/${vm}: the submit written after the refusal never runs`, OPTIONS, async () => {
      await scenario(async ({ port, submit, observe, before }) => {
        const answers = await exchange(port, [item.make(port, vr), submit({}, JSON_TYPE, vm)], { oneWrite: false });
        // The second write may hit a socket the service has already destroyed: the reset can then discard the refusal in flight (README: honest limits),
        // so the answer is optional here; what must hold either way is that the submit never ran. In HTTP/1.0 framing the write can also land before the
        // destroy and then be answered by the typed 400 for data after Connection: close.
        const allowed = vr === '1.0' ? [item.status, 400] : [item.status];
        assert.ok(answers.length <= (vr === '1.0' ? 2 : 1) && answers.every((answer) => allowed.includes(answer.status)), JSON.stringify(answers));
        assert.deepEqual(await observe(), before);
      });
    });
  }
}

for (const vm of ['1.1', '1.0']) {
  test(`pipelined: [valid submit HTTP/${vm}][refusal]: the first submit applies, the refusal never overtakes it`, OPTIONS, async () => {
    await scenario(async ({ port, submit, observe, before }) => {
      const answers = await exchange(port, [submit({}, JSON_TYPE, vm), bare(port, '/nope')]);
      if (vm === '1.1') {
        assert.equal(answers[0].status, 201);
        assert.ok(answers.length === 1 || (answers.length === 2 && answers[1].status === 404), JSON.stringify(answers));
      } else {
        // Without keep-alive the bytes behind the submit are data after Connection: close: the typed 400 ends the connection at once and may take the
        // place of the submit's answer (its effect is not lost: README, honest limits).
        assert.ok(answers.length >= 1 && answers.every((answer) => answer.status === 201 || (answer.status === 400 && answer.code === 'MALFORMED_REQUEST')), JSON.stringify(answers));
      }
      await until(async () => (await observe()).committed === before.committed + 1, 'the first submit was applied');
      assert.deepEqual(await observe(), { committed: before.committed + 1, records: before.records + 2, stepStatus: 200 });
    });
  });
}

test('pipelined: a submit with chunked framing or Expect: 100-continue behind a refusal never runs (and is never invited to send a body); before a refusal it applies', OPTIONS, async () => {
  await scenario(async ({ port, input, submit, observe, before }) => {
    const chunkedSubmit = () => `${chunkedHead(port, '/v1/steps')}${chunkedBody(JSON.stringify(input()))}`;
    for (const make of [chunkedSubmit, () => submit({}, [...JSON_TYPE, 'Expect: 100-continue'])]) {
      const answers = await exchange(port, [bare(port, '/nope'), make()]);
      assert.deepEqual(answers.map((item) => item.status), [404]);
      assert.equal(answers.interim, 0, 'no 100 Continue for a request that was dropped');
      assert.deepEqual(await observe(), before);
    }
    const first = await exchange(port, [chunkedSubmit(), bare(port, '/nope')]);
    assert.deepEqual(first.map((item) => item.status), [201, 404]);
    assert.equal((await observe()).committed, before.committed + 1);
  });
});

test('Expect: 100-continue: a legitimate request gets its 100 Continue when it starts, sends its body and gets its answer', OPTIONS, async () => {
  await scenario(async ({ port, input, observe, before }) => {
    const body = JSON.stringify(input());
    const head = `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n`;
    const socket = net.connect({ host: '127.0.0.1', port });
    const chunks = [];
    socket.on('error', () => {});
    socket.on('data', (chunk) => chunks.push(chunk));
    const closed = new Promise((resolve) => socket.once('close', resolve));
    try {
      socket.write(head);
      for (let turn = 0; turn < 200000 && !/100 Continue/.test(Buffer.concat(chunks).toString('latin1')); turn += 1) await settleTurn();
      assert.match(Buffer.concat(chunks).toString('latin1'), /^HTTP\/1\.1 100 Continue/, 'the service invites the body');
      socket.write(body);
      await Promise.race([closed, new Promise((resolve, reject) => setTimeout(() => reject(new Error('no answer to the continued request')), 20000).unref())]);
      assert.match(Buffer.concat(chunks).toString('latin1'), /HTTP\/1\.1 201 /);
      assert.equal((await observe()).committed, before.committed + 1);
    } finally {
      socket.destroy();
    }
  });
});

test('pipelined: an engine rejection (quota full) is a refusal too: the submit behind it never runs', OPTIONS, async () => {
  await scenario(async ({ port, input, submit, observe, before }) => {
    assert.equal((await call(port, 'POST', '/v1/steps', input({ idempotencyKey: 'pipe-fill-0001', leaseId: 'synthetic-lease-002', units: 10 }))).status, 201);
    const filled = await observe();
    const answers = await exchange(port, [submit({ idempotencyKey: 'pipe-over-0001', leaseId: 'synthetic-lease-002', units: 1 }), submit()]);
    assert.deepEqual(answers.map((item) => [item.status, item.code]), [[409, 'CAPACITY_EXHAUSTED']]);
    assert.deepEqual(await observe(), { ...filled, committed: before.committed });
  }, { fresh: true });
});

test('pipelined: honest requests are still answered in order, one at a time; more pipelined requests than the bound close the connection', OPTIONS, async () => {
  await scenario(async ({ port, submit, observe, before }) => {
    const answers = await exchange(port, [bare(port, '/scope.json'), submit(), bare(port, '/v1/leases', 'Connection: close\r\n')]);
    assert.deepEqual(answers.map((item) => item.status), [200, 201, 200]);
    assert.equal((await observe()).committed, before.committed + 1);
    const many = await exchange(port, Array.from({ length: 12 }, () => bare(port, '/scope.json')));
    assert.ok(many.length <= 5 && many.every((item) => item.status === 200), `${many.length} answers before the bound closed the connection`);
  });
});

test('a parse error ends the connection: the request in flight finishes (its answer is lost), the one waiting behind it never runs, the typed 400 is the answer', OPTIONS, async () => {
  const service = await startService({ hold: true });
  const [first, second] = ['pipe-parse-0001', 'pipe-parse-0002'];
  const submit = (key) => withBody(service.port, 'POST', '/v1/steps', JSON.stringify({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 1 }), JSON_TYPE);
  try {
    const exchanged = exchange(service.port, [submit(first), submit(second), `GET /scope.json HTTP/9.9\r\nHost: 127.0.0.1:${service.port}\r\n\r\n`]);
    await service.held.entered(first);
    assert.deepEqual((await exchanged).map((item) => [item.status, item.code, item.close]), [[400, 'MALFORMED_REQUEST', true]]);
    for (let turn = 0; turn < 50; turn += 1) await settleTurn();
    assert.equal(service.server.engine.inspect(second).status, 404, 'the request that waited behind the first never started');
    service.held.release(first);
    await until(() => service.server.engine.inspect(first).status === 200, 'the request in flight finished: its effect is not lost');
  } finally {
    service.held.release(first);
    await service.stop();
  }
});

test('an Upgrade header is ignored: the request is answered as an ordinary one (never 101)', OPTIONS, async () => {
  await scenario(async ({ port }) => {
    const answers = await exchange(port, [bare(port, '/scope.json', 'Connection: Upgrade\r\nUpgrade: websocket\r\n')]);
    assert.deepEqual(answers.map((item) => item.status), [200]);
  });
});
