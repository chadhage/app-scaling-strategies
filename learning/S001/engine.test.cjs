'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const lesson = require('./engine.js');

function warmed(condition = 'healthy') {
  return lesson.act(lesson.createExercise(condition), 'warm');
}

function handedOff(condition = 'healthy') {
  return lesson.act(warmed(condition), 'handoff');
}

test('initial state distinguishes existing v1 work from unready new admissions', () => {
  const state = lesson.createExercise();
  assert.equal(state.mode, 'synthetic');
  assert.equal(state.verdict, 'NOT_RUN');
  assert.equal(state.v1, 'ACTIVE');
  assert.equal(state.v2, 'WARMING');
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.oldJourney.destination, 'v1');
  assert.equal(state.oldJourney.effectCount, 0);
  assert.equal(state.newJourney, null);
  assert.equal(state.attemptedTransitions.length, 0);
});

test('warm-up proves readiness but is not itself a migrated user', () => {
  const state = warmed();
  assert.equal(state.v2, 'READY', 'warm-up must implement the readiness transition');
  assert.equal(state.verdict, 'READY');
  assert.equal(state.readiness.verdict, 'PASS');
  assert.equal(state.readiness.checks.length, 10);
  assert.ok(state.readiness.checks.every((check) => check.status === 'pass'));
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.newJourney, null);
  assert.equal(state.userImpact.classification, 'not-migrated');
});

test('handoff observes v2 state, effects, and latency while old work stays on v1', () => {
  const state = handedOff();
  assert.equal(state.verdict, 'PASS', 'eligible handoff must be evaluated');
  assert.equal(state.v1, 'DRAINING');
  assert.equal(state.v2, 'ACTIVE');
  assert.equal(state.admissionTarget, 'v2');
  assert.deepEqual(state.newJourney, {
    id: 'new-002', destination: 'v2', completed: true,
    authenticated: true, cartQuantity: 3, effectCount: 1, latencyMs: 180
  });
  assert.equal(state.oldJourney.status, 'running');
  assert.equal(state.oldJourney.destination, 'v1');
  assert.equal(state.oldJourney.effectCount, 0);
  assert.equal(state.userImpact.classification, 'uninterrupted');
  assert.equal(state.userImpact.successfulTransitions, 1);
  assert.equal(state.cleanup.status, 'retained');
  assert.equal(state.attemptedTransitions.length, 1);
  assert.ok(state.trace.some((event) => event.event === 'admission-observed'));
});

test('choosing unready v2 fails the exercise but safely aborts before exposure', () => {
  const state = lesson.act(lesson.createExercise(), 'handoff');
  assert.equal(state.verdict, 'FAIL', 'unready destination must fail, not silently succeed');
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.newJourney, null);
  assert.equal(state.attemptedTransitions.length, 0);
  assert.equal(state.userImpact.classification, 'safe-abort');
  assert.equal(state.oldJourney.status, 'running');
  assert.equal(state.cleanup.status, 'retained');
  assert.equal(lesson.act(state, 'warm').verdict, 'FAIL', 'reset is required after a failed exercise');
});

for (const condition of ['dependency-failure', 'incompatible-state', 'duplicate-effects', 'slow-warmup']) {
  test(`${condition} is a known gate failure and never exposes v2`, () => {
    const state = lesson.act(warmed(condition), 'handoff');
    assert.equal(state.verdict, 'FAIL');
    assert.equal(state.v2, 'ABORTED');
    assert.equal(state.admissionTarget, 'v1');
    assert.equal(state.newJourney, null);
    assert.equal(state.userImpact.classification, 'safe-abort');
    assert.ok(state.readiness.checks.some((check) => check.status === 'fail'));
  });
}

test('missing readiness evidence stays unknown, with no manufactured migration', () => {
  const state = lesson.act(warmed('missing-readiness'), 'handoff');
  assert.equal(state.verdict, 'UNKNOWN');
  assert.notEqual(state.v2, 'READY');
  assert.equal(state.readiness.checks.find((check) => check.id === 'dependencies').status, 'unknown');
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.newJourney, null);
  assert.equal(state.userImpact.classification, 'unknown');
  assert.equal(state.userImpact.successfulTransitions, 0);
});

test('a missing observed version is unknown even when desired routing was v2', () => {
  assert.equal(warmed('missing-admission').verdict, 'READY');
  const state = handedOff('missing-admission');
  assert.equal(state.verdict, 'UNKNOWN');
  assert.equal(state.newJourney.destination, null);
  assert.equal(state.v2, 'QUARANTINED');
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.attemptedTransitions.length, 1);
  assert.equal(state.attemptedTransitions[0].verdict, 'UNKNOWN');
  assert.equal(state.userImpact.classification, 'unknown');
  assert.equal(state.userImpact.successfulTransitions, 0);
  assert.notEqual(lesson.act(state, 'retire').v1, 'RETIRED');
});

test('an exposed latency failure remains interrupted after rollback and cleanup actions', () => {
  assert.equal(warmed('regressed-handoff').verdict, 'READY');
  let state = handedOff('regressed-handoff');
  assert.equal(state.verdict, 'FAIL');
  assert.equal(state.newJourney.destination, 'v2');
  assert.equal(state.newJourney.latencyMs, 501);
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.userImpact.classification, 'interrupted');
  assert.equal(state.userImpact.interruptedJourneys, 1);
  for (const action of ['drain', 'elapse', 'retire']) state = lesson.act(state, action);
  assert.equal(state.verdict, 'FAIL');
  assert.equal(state.attemptedTransitions[0].verdict, 'FAIL');
  assert.equal(state.userImpact.interruptedJourneys, 1);
  assert.notEqual(state.v1, 'RETIRED');
});

test('retirement needs both observed drain and the rollback retention window', () => {
  for (const actions of [[], ['drain'], ['elapse']]) {
    let state = handedOff();
    for (const action of actions) state = lesson.act(state, action);
    state = lesson.act(state, 'retire');
    assert.equal(state.verdict, 'FAIL', `unsafe retirement must fail after ${actions.join(',') || 'no gates'}`);
    assert.notEqual(state.v1, 'RETIRED');
    assert.equal(state.cleanup.status, 'retained');
    assert.equal(state.newJourney.destination, 'v2', 'a blocked retirement does not erase the observed handoff');
    assert.equal(state.userImpact.successfulTransitions, 1);
  }
});

test('safe drain and retention permit retirement without duplicating old effects', () => {
  let state = handedOff();
  state = lesson.act(state, 'drain');
  state = lesson.act(state, 'drain');
  assert.equal(state.oldJourney.status, 'complete');
  assert.equal(state.oldJourney.destination, 'v1');
  assert.equal(state.oldJourney.effectCount, 1);
  assert.equal(state.oldJourney.latencyMs, 240);
  assert.equal(state.v1, 'RETAINED');
  assert.equal(state.cleanup.status, 'retained');
  state = lesson.act(state, 'elapse');
  assert.equal(state.elapsedSinceHandoffMs, 1000);
  state = lesson.act(state, 'retire');
  assert.equal(state.verdict, 'PASS');
  assert.equal(state.v1, 'RETIRED');
  assert.equal(state.cleanup.status, 'complete');
  assert.equal(state.newJourney.effectCount, 1);
  assert.match(state.cleanup.message, /no external resources/i);
});

test('latency and overlap capacity boundaries are inclusive, and missing is not zero', () => {
  const observation = lesson.fixture().readiness;
  assert.equal(lesson.evaluateReadiness({ ...observation, latencyMs: 500, overlapUnits: 2 }).verdict, 'PASS');
  assert.equal(lesson.evaluateReadiness({ ...observation, latencyMs: 501 }).verdict, 'FAIL');
  assert.equal(lesson.evaluateReadiness({ ...observation, overlapUnits: 1 }).verdict, 'FAIL');
  assert.equal(lesson.evaluateReadiness({ ...observation, latencyMs: null }).verdict, 'UNKNOWN');
  assert.equal(lesson.evaluateReadiness({ ...observation, latencyMs: -1 }).verdict, 'FAIL');
});

test('freshness boundaries and candidate identity cannot be bypassed', () => {
  const observation = lesson.fixture().readiness;
  assert.equal(lesson.evaluateReadiness({ ...observation, ageMs: 1000 }).verdict, 'PASS');
  assert.equal(lesson.evaluateReadiness({ ...observation, ageMs: 1001 }).verdict, 'UNKNOWN');
  assert.equal(lesson.evaluateReadiness({ ...observation, candidateId: 'v2@old-epoch' }).verdict, 'FAIL');
  assert.equal(lesson.evaluateReadiness({ ...observation, candidateId: null }).verdict, 'UNKNOWN');
});

test('state, authentication, destination, and exactly-once effects are required observations', () => {
  const journey = lesson.fixture().admission;
  assert.equal(lesson.evaluateTransition(journey).verdict, 'PASS');
  for (const patch of [
    { destination: 'v1' }, { authenticated: false }, { cartQuantity: 2 },
    { effectCount: 0 }, { effectCount: 2 }, { completed: false }, { latencyMs: 501 }
  ]) {
    assert.equal(lesson.evaluateTransition({ ...journey, ...patch }).verdict, 'FAIL', JSON.stringify(patch));
  }
  assert.equal(lesson.evaluateTransition({ ...journey, effectCount: null }).verdict, 'UNKNOWN');
});

test('missing or empty transition evidence and missing readiness never mean success', () => {
  for (const evidence of [undefined, null, {}, []]) {
    assert.equal(lesson.evaluateTransition(evidence).verdict, 'UNKNOWN');
    assert.equal(lesson.evaluateReadiness(evidence).verdict, 'UNKNOWN');
  }
});

test('unknown conditions and actions do not fall back to healthy success', () => {
  assert.throws(() => lesson.createExercise('not-a-fixture'), RangeError);
  const state = lesson.act(lesson.createExercise(), 'not-an-action');
  assert.equal(state.verdict, 'FAIL');
  assert.equal(state.admissionTarget, 'v1');
  assert.equal(state.attemptedTransitions.length, 0);
});

test('replays are deterministic, immutable, and fixture copies are isolated', () => {
  const initial = lesson.createExercise();
  const snapshot = JSON.stringify(initial);
  lesson.act(initial, 'warm');
  assert.equal(JSON.stringify(initial), snapshot);
  assert.deepEqual(handedOff(), handedOff());
  const fixture = lesson.fixture();
  fixture.readiness.dependenciesReady = false;
  assert.equal(lesson.fixture().readiness.dependenciesReady, true);
});

test('the same dependency-free engine works as a browser global', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./engine.js'), 'utf8'), context);
  assert.equal(typeof context.WarmHandoffLesson.act, 'function');
  const engine = context.WarmHandoffLesson;
  assert.equal(engine.act(engine.act(engine.createExercise(), 'warm'), 'handoff').verdict, 'PASS');
});

test('portable bundle declares lineage and restricts execution to local scripts and styles', () => {
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'lesson.json'), 'utf8'));
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const directive of ["default-src 'none'", "connect-src 'none'", "script-src 'self'", "style-src 'self'", "form-action 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const script of scripts) {
    const source = script[1].match(/src="([^"]+)"/)[1];
    assert.ok(['engine.js', 'app.js'].includes(source));
    assert.equal(script[2].trim(), '');
    assert.ok(fs.existsSync(path.join(__dirname, source)));
  }
  assert.doesNotMatch(html, /\son[a-z]+=/i);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8'), /@import|url\s*\(/i);
  assert.equal(manifest.cardId, 'A-S001');
  assert.equal(manifest.kanoUnit, 'A-S001');
  assert.equal(manifest.parentId, 'D-S001');
  assert.equal(manifest.sourceId, 'S001');
  assert.equal(manifest.packet, 'LP-LEARN');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.networkCalls, false);
  assert.equal(manifest.iac.status, 'N/A');
});
