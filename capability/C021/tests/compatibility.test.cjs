'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const api = require('../compatibility.js');
const contract = require('../../C020/contract.js');
const inspector = require('../../C020/inspector.js');
const { getProfileV1, getProfileV2 } = require('../../C020/profiles.cjs');

const expected = [
  {
    profile: {
      id: 'synthetic-001', displayName: 'Avery Example', email: 'avery@example.invalid',
      preferences: { locale: 'en-GB', theme: 'dark', topics: ['scaling', 'versions'] }
    },
    person: {
      key: 'synthetic-001', name: 'Avery Example', contact: { emailAddress: 'avery@example.invalid' },
      settings: { language: 'en-GB', colorScheme: 'dark', interests: ['scaling', 'versions'] }
    }
  },
  {
    profile: {
      id: 'synthetic-002', displayName: 'Jordan Sample', email: 'jordan@example.invalid',
      preferences: { locale: 'fr-FR', theme: 'light', topics: [] }
    },
    person: {
      key: 'synthetic-002', name: 'Jordan Sample', contact: { emailAddress: 'jordan@example.invalid' },
      settings: { language: 'fr-FR', colorScheme: 'light', interests: [] }
    }
  }
];

function frozen(value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozen);
  }
}

test('the exported oldConsumer is the actual unchanged C020 function, not a local replacement', () => {
  assert.equal(api.oldConsumer, inspector.oldConsumer);
  assert.equal(api.newContract, 'getProfile/2');
  assert.equal(api.adapterId, 'C021/getProfile-2-to-1/r1');
  assert.equal(Object.isFrozen(api), true);
});

test('the deliberately changed shape is incompatible even if a caller lies about its API identifier', () => {
  const raw = JSON.parse(JSON.stringify(api.makeBreaking(getProfileV1({ profileId: 'synthetic-001' }), 'v1', 'synthetic-001')));
  raw.apiContract = 'getProfile/1';
  assert.throws(() => inspector.oldConsumer(raw), { code: 'INVALID_PROFILE' });
  const mislabeledOld = JSON.parse(JSON.stringify(getProfileV1({ profileId: 'synthetic-001' })));
  mislabeledOld.apiContract = 'getProfile/2';
  assert.throws(() => api.newConsumer(mislabeledOld, 'v1', 'synthetic-001'), { code: 'INVALID_ENVELOPE' });
});

for (const [implementation, provider] of [['v1', getProfileV1], ['v2', getProfileV2]]) {
  for (const { profile, person } of expected) {
    const name = `${implementation}/${profile.id}`;

    test(`${name}: actual accepted C020 exports retain getProfile/1 and all original fields`, () => {
      const source = provider({ profileId: profile.id });
      assert.equal(source.apiContract, 'getProfile/1');
      assert.deepEqual(inspector.oldConsumer(source), profile);
      assert.deepEqual(source.stamp, contract.stamps[implementation]);
      assert.equal(inspector.inspect(source, implementation, profile.id).verified, true);
    });

    test(`${name}: one explicitly different contract renames and nests fields without changing values`, () => {
      const source = provider({ profileId: profile.id });
      const raw = api.makeBreaking(source, implementation, profile.id);
      assert.deepEqual(raw, {
        apiContract: 'getProfile/2', person,
        provenance: {
          fixtureRevision: 'C021-breaking-r1', mode: 'synthetic-local-contract-rehearsal',
          dataKind: 'synthetic', sourceApiContract: 'getProfile/1', sourceStamp: source.stamp
        }
      });
      assert.equal(Object.hasOwn(raw, 'profile'), false);
      assert.throws(() => inspector.oldConsumer(raw), { code: 'CONTRACT_MISMATCH' });
      assert.deepEqual(api.newConsumer(raw, implementation, profile.id), profile);
      assert.throws(() => api.newConsumer(source, implementation, profile.id), { code: 'CONTRACT_MISMATCH' });
    });

    test(`${name}: only an explicit adapter makes raw safe for the unchanged old consumer`, () => {
      const source = provider({ profileId: profile.id });
      const raw = api.makeBreaking(source, implementation, profile.id);
      const adapted = api.adaptToOld(raw, implementation, profile.id);
      assert.deepEqual(adapted, {
        apiContract: 'getProfile/1', profile,
        provenance: {
          adapterId: 'C021/getProfile-2-to-1/r1', inputContract: 'getProfile/2', outputContract: 'getProfile/1',
          mode: 'synthetic-local-contract-rehearsal', dataKind: 'synthetic',
          sourceFixtureRevision: 'C021-breaking-r1', sourceApiContract: 'getProfile/1',
          sourceStamp: source.stamp
        }
      });
      assert.deepEqual(inspector.oldConsumer(adapted), profile);
      assert.equal(Object.hasOwn(adapted, 'stamp'), false, 'adaptation must not impersonate an original C020 observation');
      assert.throws(() => inspector.inspect(adapted, implementation, profile.id), { code: 'STAMP_MISMATCH' });
      assert.throws(() => api.newConsumer(adapted, implementation, profile.id), { code: 'CONTRACT_MISMATCH' });
      assert.throws(() => api.adaptToOld(adapted, implementation, profile.id), { code: 'CONTRACT_MISMATCH' });
    });

    test(`${name}: matrix evaluates both consumers and never labels every transition safe`, () => {
      const result = api.rehearse(provider({ profileId: profile.id }), implementation, profile.id);
      assert.equal(result.mode, 'synthetic-local-contract-rehearsal');
      assert.deepEqual(result.outcomes, [
        { transition: 'baseline -> old', outcome: 'SAFE', code: 'SEMANTICS_PRESERVED' },
        { transition: 'raw -> old', outcome: 'BREAKING', code: 'CONTRACT_MISMATCH' },
        { transition: 'raw -> new', outcome: 'SAFE', code: 'SEMANTICS_PRESERVED' },
        { transition: 'adapted -> old', outcome: 'SAFE', code: 'SEMANTICS_PRESERVED' },
        { transition: 'baseline -> new', outcome: 'BREAKING', code: 'CONTRACT_MISMATCH' },
        { transition: 'adapted -> new', outcome: 'BREAKING', code: 'CONTRACT_MISMATCH' }
      ]);
      assert.deepEqual(result.oldSemantics, profile);
      assert.deepEqual(result.newSemantics, profile);
      assert.deepEqual(result.adaptedSemantics, profile);
      assert.equal(result.baseline.stamp.implementationVersion, implementation === 'v1' ? '1.0.0' : '2.0.0');
      assert.equal(result.baseline.apiContract, 'getProfile/1', 'deployment/implementation versions are not API versions');
    });

    test(`${name}: responses, provenance, consumers, and nested collections are immutable and unaliased`, () => {
      const source = provider({ profileId: profile.id });
      const before = JSON.stringify(source);
      const one = api.rehearse(source, implementation, profile.id);
      const two = api.rehearse(source, implementation, profile.id);
      frozen(one);
      frozen(two);
      assert.notEqual(one.baseline, source);
      assert.notEqual(one.baseline.profile.preferences.topics, source.profile.preferences.topics);
      assert.notEqual(one.raw, two.raw);
      assert.notEqual(one.raw.provenance.sourceStamp, source.stamp);
      assert.notEqual(one.raw.provenance.sourceStamp, one.adapted.provenance.sourceStamp);
      assert.notEqual(one.raw.person.settings.interests, two.raw.person.settings.interests);
      assert.notEqual(one.adapted.profile.preferences.topics, one.raw.person.settings.interests);
      assert.notEqual(one.oldSemantics.preferences.topics, one.adaptedSemantics.preferences.topics);
      assert.throws(() => { one.raw.person.settings.interests.push('mutated'); }, TypeError);
      assert.throws(() => { one.adapted.provenance.sourceStamp.deploymentStamp = 'production'; }, TypeError);
      const local = JSON.parse(JSON.stringify(one));
      local.raw.person.settings.interests.push('caller-only');
      local.adapted.profile.preferences.locale = 'caller-only';
      assert.deepEqual(api.rehearse(source, implementation, profile.id), two);
      assert.equal(JSON.stringify(source), before);
      assert.deepEqual(contract.profiles, expected.map((item) => item.profile));
    });
  }
}

test('mutable valid candidate objects are not frozen or mutated by consumption and adaptation', () => {
  const raw = JSON.parse(JSON.stringify(api.makeBreaking(getProfileV2({ profileId: 'synthetic-001' }), 'v2', 'synthetic-001')));
  const before = JSON.stringify(raw);
  const consumed = api.newConsumer(raw, 'v2', 'synthetic-001');
  const adapted = api.adaptToOld(raw, 'v2', 'synthetic-001');
  assert.equal(Object.isFrozen(raw), false);
  assert.equal(JSON.stringify(raw), before);
  assert.notEqual(consumed.preferences.topics, raw.person.settings.interests);
  assert.notEqual(adapted.provenance.sourceStamp, raw.provenance.sourceStamp);
  raw.person.settings.interests.reverse();
  assert.deepEqual(consumed, expected[0].profile);
  assert.deepEqual(inspector.oldConsumer(adapted), expected[0].profile);
});

test('independent interleaved calls never leak caller-local JSON edits into C020 or later adaptations', async () => {
  const results = await Promise.all(Array.from({ length: 40 }, async (_, index) => {
    const { profile } = expected[index % 2];
    const implementation = index % 2 ? 'v1' : 'v2';
    const source = (implementation === 'v1' ? getProfileV1 : getProfileV2)({ profileId: profile.id });
    const result = api.rehearse(source, implementation, profile.id);
    const local = JSON.parse(JSON.stringify(result));
    local.adapted.profile.email = `caller-${index}@example.invalid`;
    return result;
  }));
  results.forEach((result, index) => {
    assert.deepEqual(result.adaptedSemantics, expected[index % 2].profile);
    frozen(result);
  });
  assert.deepEqual(contract.profiles, expected.map((item) => item.profile));
});

test('the real browser factories expose the same contract behavior with frozen, nonwritable globals', () => {
  const browser = vm.createContext({});
  for (const file of [
    path.join(__dirname, '..', '..', 'C020', 'contract.js'),
    path.join(__dirname, '..', '..', 'C020', 'inspector.js'),
    path.join(__dirname, '..', 'compatibility.js')
  ]) vm.runInContext(fs.readFileSync(file, 'utf8'), browser);
  const baseline = getProfileV2({ profileId: 'synthetic-002' });
  const result = vm.runInContext(`C021Compatibility.rehearse(${JSON.stringify(baseline)}, 'v2', 'synthetic-002')`, browser);
  assert.deepEqual(JSON.parse(JSON.stringify(result.adaptedSemantics)), expected[1].profile);
  assert.equal(browser.C021Compatibility.oldConsumer, browser.C020Inspector.oldConsumer);
  assert.equal(Object.getOwnPropertyDescriptor(browser, 'C021Compatibility').writable, false);
  assert.equal(Object.isFrozen(browser.C021Compatibility), true);
  assert.equal(Object.isFrozen(browser.C020Contract.profiles[0].preferences.topics), true);
});

for (const missing of ['contract', 'inspector']) {
  test(`factory can load but fails closed when the actual C020 ${missing} dependency is missing`, () => {
    const browser = vm.createContext({});
    if (missing !== 'contract') {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'C020', 'contract.js'), 'utf8'), browser);
    }
    if (missing !== 'inspector') {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'C020', 'inspector.js'), 'utf8'), browser);
    }
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'compatibility.js'), 'utf8'), browser);
    assert.throws(() => vm.runInContext("C021Compatibility.rehearse({}, 'v1', 'synthetic-001')", browser), {
      code: 'CONTRACT_UNAVAILABLE'
    });
  });
}
