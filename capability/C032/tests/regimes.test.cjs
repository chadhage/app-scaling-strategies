'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createClient } = require('../client.js');
const { CookieJar, jarFetch, startDecoyOrigin } = require('./cookie-jar.cjs');
const { credentials, withServer } = require('./support.cjs');

// The destination transition happens at alpha's third served request; beta is counted independently.
const SEQUENCE = ['alpha', 'alpha', 'alpha', 'beta', 'alpha', 'beta'];
const EXPECTED = [
  ['synthetic-client-alpha', 'synthetic-destination-blue', '1.0.0', 1],
  ['synthetic-client-alpha', 'synthetic-destination-blue', '1.0.0', 2],
  ['synthetic-client-alpha', 'synthetic-destination-green', '2.0.0', 3],
  ['synthetic-client-beta', 'synthetic-destination-blue', '1.0.0', 1],
  ['synthetic-client-alpha', 'synthetic-destination-green', '2.0.0', 4],
  ['synthetic-client-beta', 'synthetic-destination-blue', '1.0.0', 2]
].map(([client, destination, version, counter]) => ({ client, destination, version, counter, stamp: 'C032-loopback-r1' }));
const OPPOSITE_DESTINATION = { 'synthetic-destination-blue': 'synthetic-destination-green', 'synthetic-destination-green': 'synthetic-destination-blue' };
const OPPOSITE_CLIENT = { 'synthetic-client-alpha': 'synthetic-client-beta', 'synthetic-client-beta': 'synthetic-client-alpha' };

const projection = (observation) => ({
  client: observation.client.id, destination: observation.destination.id, version: observation.destination.version,
  counter: observation.state.counter, stamp: observation.stamp
});

function conflicting(expected, step) {
  const destination = OPPOSITE_DESTINATION[expected.destination];
  return `c032_destination=${destination}; c032_client=${OPPOSITE_CLIENT[expected.client]}; ARRAffinity=synthetic-affinity-${destination}; session=synthetic-session-${step}`;
}

// The client's own request must be cookie-less whatever the environment adds around it.
function assertCookieless(init) {
  assert.equal(init.credentials, 'omit');
  assert.deepEqual(Object.keys(init.headers).map((name) => name.toLowerCase()).sort(), ['accept', 'authorization']);
  assert.match(init.headers.Authorization, /^Bearer c032-synthetic-opaque-[a-z]+-\d{4}$/);
}

// Builds the three regimes around one fixture; each regime returns the Cookie header the server was sent.
function regimes(fixture, decoyOrigin) {
  const jar = new CookieJar();
  const handOut = jarFetch(jar);
  const carry = jarFetch(jar);
  return {
    jar,
    none: () => async (url, init) => { assertCookieless(init); return fetch(url, init); },
    decoy: (expected, step) => async (url, init) => {
      assertCookieless(init);
      return fetch(url, { ...init, headers: { ...init.headers, Cookie: conflicting(expected, step) } });
    },
    jarred: (expected) => async (url, init) => {
      assertCookieless(init);
      const handedOut = await handOut(`${decoyOrigin.origin}/set/${OPPOSITE_DESTINATION[expected.destination]}/${OPPOSITE_CLIENT[expected.client]}`);
      assert.equal(handedOut.status, 204);
      return carry(url, init);
    }
  };
}

async function runSequence(regimeFor) {
  const decoyOrigin = await startDecoyOrigin();
  try {
    return await withServer({}, async (fixture) => {
      const built = regimes(fixture, decoyOrigin);
      const observed = [];
      for (const [step, name] of SEQUENCE.entries()) {
        const expected = EXPECTED[step];
        const observer = createClient({ fetch: regimeFor(built, expected, step), baseUrl: fixture.origin, credential: credentials[name] });
        observed.push(projection(await observer.observe()));
      }
      return { observed, cookiesSeen: fixture.seen.map((item) => item.headers.cookie ?? null), jar: built.jar, decoyPort: decoyOrigin.port, port: fixture.port };
    });
  } finally {
    await decoyOrigin.close();
  }
}

test('baseline: the same authenticated sequence with no Cookie header follows the server-owned plan', async () => {
  const run = await runSequence((built) => built.none());
  assert.deepEqual(run.observed, EXPECTED);
  assert.deepEqual(run.cookiesSeen, SEQUENCE.map(() => null), 'the server saw no Cookie header at all');
});

test('a conflicting decoy cookie on every request yields identical observations', async () => {
  const run = await runSequence((built, expected, step) => built.decoy(expected, step));
  assert.deepEqual(run.cookiesSeen, EXPECTED.map((expected, step) => conflicting(expected, step)), 'the conflicting cookies really reached the server');
  assert.deepEqual(run.observed, EXPECTED);
  assert.ok(run.cookiesSeen.every((cookie, step) => !cookie.includes(`c032_destination=${EXPECTED[step].destination}`)), 'every decoy named the other destination');
});

test('a cookie jar handed Set-Cookie attempts by a foreign loopback origin yields identical observations and stays foreign', async () => {
  const run = await runSequence((built, expected) => built.jarred(expected));
  assert.ok(run.cookiesSeen.every((cookie) => /c032_destination=.+; c032_client=.+; ARRAffinity=synthetic-affinity-.+; session=synthetic-session-decoy/.test(cookie)));
  assert.ok(run.cookiesSeen.every((cookie, step) => cookie.includes(`c032_destination=${OPPOSITE_DESTINATION[EXPECTED[step].destination]}`)));
  assert.deepEqual(run.observed, EXPECTED);
  assert.deepEqual(run.jar.storeLog.map((entry) => entry.port), SEQUENCE.map(() => run.decoyPort), 'only the foreign origin ever set a cookie');
  assert.ok(run.jar.storeLog.every((entry) => entry.port !== run.port));
});

test('one server alternating the three regimes request by request gives the same sequence', async () => {
  const decoyOrigin = await startDecoyOrigin();
  try {
    await withServer({}, async (fixture) => {
      const built = regimes(fixture, decoyOrigin);
      const observed = [];
      for (const [step, name] of SEQUENCE.entries()) {
        const expected = EXPECTED[step];
        const regime = [built.none(), built.decoy(expected, step), built.jarred(expected)][step % 3];
        observed.push(projection(await createClient({ fetch: regime, baseUrl: fixture.origin, credential: credentials[name] }).observe()));
      }
      assert.deepEqual(observed, EXPECTED);
      assert.deepEqual(fixture.seen.map((item) => item.headers.cookie === undefined), [true, false, false, true, false, false],
        'the cookie regime really alternated on the wire');
    });
  } finally {
    await decoyOrigin.close();
  }
});

test('a cookie jar that talks only to the C032 server is never handed a cookie, for success or failure', async () => {
  await withServer({}, async (fixture) => {
    const jar = new CookieJar();
    const carry = jarFetch(jar);
    for (const credential of [credentials.alpha, credentials.forged, credentials.expired, undefined]) {
      const observer = createClient({ fetch: carry, baseUrl: fixture.origin, credential });
      await observer.observe().catch(() => null);
    }
    assert.equal((await carry(`${fixture.origin}/scope.json`)).status, 200);
    assert.equal((await carry(`${fixture.origin}/`)).status, 200);
    assert.equal(jar.cookies.size, 0);
    assert.deepEqual(jar.storeLog, []);
    assert.ok(fixture.seen.every((item) => item.headers.cookie === undefined));
  });
});

test('the jar helper is honest: it stores and replays cookies by host name, not by port', async () => {
  const jar = new CookieJar();
  jar.store('http://127.0.0.1:1111/x', ['a=1; Path=/', 'b=2']);
  assert.equal(jar.headerFor('http://127.0.0.1:2222/y'), 'a=1; b=2');
  assert.equal(jar.headerFor('http://localhost:2222/y'), null);
  assert.deepEqual(jar.storeLog, [{ port: 1111, names: ['a', 'b'] }]);
});
