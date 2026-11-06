'use strict';

// Test tooling, not production code. Deterministic ids and clock, controllable step gates, scratch journals under the
// namespace (git-ignored, always removed), command builders and an independent oracle that reads the raw journal.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const root = path.join(__dirname, '..');
const scratchRoot = path.join(root, 'test-scratch');
const attribution = Object.freeze({ leaseId: 'lease-synthetic-001', runId: 'synthetic-run-001', userId: 'user-synthetic-001' });
const OUTCOMES = Object.freeze(['CANCELLED_BEFORE_EFFECT', 'CANCELLED_PARTIAL', 'CANCEL_TOO_LATE', 'COMPENSATED', 'CANCEL_UNKNOWN']);

function engineModule() {
  return process.env.C017_TEST_ENGINE ? require(path.resolve(process.env.C017_TEST_ENGINE)) : require('../engine.cjs');
}

function scratch(label = 'j') {
  fs.mkdirSync(scratchRoot, { recursive: true });
  const dir = path.join(scratchRoot, `${label}-${randomUUID().slice(0, 8)}`);
  fs.mkdirSync(dir);
  return { dir, remove() { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } };
}

const sequence = () => { let n = 0; return () => String(++n).padStart(8, '0'); };
const clock = () => { let n = 0; return () => new Date(Date.UTC(2026, 0, 1) + (++n) * 1000).toISOString(); };

function withTimeout(promise, message, ms = 8000) {
  let timer;
  const limit = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function makeGates() {
  const slots = new Map();
  const get = (kind, step) => {
    const name = `${kind}:${step}`;
    if (!slots.has(name)) {
      const slot = { held: false };
      slot.reached = new Promise((resolve) => { slot.markReached = resolve; });
      slot.released = new Promise((resolve) => { slot.release = resolve; });
      slots.set(name, slot);
    }
    return slots.get(name);
  };
  const enter = (kind, step) => { const slot = get(kind, step); slot.markReached(); return slot.held ? slot.released : undefined; };
  return {
    gates: { beforeStep: (step) => enter('before', step), inStep: (step) => enter('in', step), inCompensation: (step) => enter('comp', step) },
    hold(kind, step) { get(kind, step).held = true; },
    release(kind, step) { get(kind, step).release(); },
    reached: (kind, step) => withTimeout(get(kind, step).reached, `gate ${kind}:${step} was never reached`),
  };
}

const startCmd = (key, expectedEpoch = 0, extra = {}) => ({ schemaVersion: 1, kind: 'start', key, ...attribution, expectedEpoch, ...extra });
const cancelCmd = (key, actionId, epoch = 1, compensate = false, extra = {}) => ({ schemaVersion: 1, kind: 'cancel', key, ...attribution, actionId, epoch, compensate, ...extra });
const reconcileCmd = (key, actionId, epoch = 1, extra = {}) => ({ schemaVersion: 1, kind: 'reconcile', key, ...attribution, actionId, epoch, ...extra });

function boot(options = {}) {
  const made = options.dir ? null : scratch('e');
  const dir = options.dir || made.dir;
  const g = makeGates();
  const engine = engineModule().createEngine({ dir, steps: 4, unitsPerStep: 5, gates: g.gates, ids: sequence(), now: clock(), ...options.engine });
  return { engine, g, dir, made, async cleanup() { await engine.close(); if (made) made.remove(); } };
}

async function startAction(ctx, key = 'start-key-0001') {
  const result = await ctx.engine.execute(startCmd(key));
  if (result.status !== 202) throw new Error(`start was not accepted: ${JSON.stringify(result.body)}`);
  return result.body.action.actionId;
}

const wait = (ctx, predicate, message) => withTimeout(ctx.engine.waitFor(predicate), message || 'engine condition was never reached');
const types = (ctx) => ctx.engine.view().journal.map((entry) => entry.type);
const decisions = (ctx) => ctx.engine.view().journal.filter((entry) => entry.type === 'cancel-decided');
function actionOf(ctx) {
  const { action } = ctx.engine.view();
  assert.ok(action, 'the engine must expose the persisted action');
  return action;
}

function oracle(entries, actionId) {
  const effects = new Map();
  const reversed = [];
  for (const entry of entries) {
    if (entry.actionId !== actionId) continue;
    if (entry.type === 'step-effect') effects.set(entry.step, entry.units);
    if (entry.type === 'compensation-effect') reversed.push(entry.step);
  }
  const standing = [...effects.keys()].filter((step) => !reversed.includes(step)).sort((a, b) => a - b);
  return { effects, reversed, standing, units: standing.reduce((sum, step) => sum + effects.get(step), 0) };
}

const allowedNegations = [/nothing was undone or rolled back\./gi, /nothing to undo/gi, /nothing is claimed as cancelled, completed or undone\./gi];

// Independent honesty oracle: every claim of a cancel answer must be provable from the raw journal entries.
function assertHonest(assert, body, entries) {
  assert.ok(OUTCOMES.includes(body.outcome), `outcome ${body.outcome} is not one of the five`);
  const o = oracle(entries, body.actionId);
  const has = (type) => entries.some((entry) => entry.actionId === body.actionId && entry.type === type);
  if (body.outcome !== 'CANCEL_UNKNOWN') {
    assert.deepEqual(body.facts.effectsStanding.map((e) => e.step), o.standing, 'standing effects must equal the journal');
    assert.deepEqual(body.facts.undone.map((e) => e.step), o.reversed, 'undone must equal the journaled compensating effects');
    assert.equal(body.facts.standingUnits, o.units);
  }
  assert.equal(body.effective, ['CANCELLED_BEFORE_EFFECT', 'CANCELLED_PARTIAL', 'COMPENSATED'].includes(body.outcome));
  if (body.outcome === 'COMPENSATED') assert.ok(o.standing.length === 0 && o.reversed.length >= 1 && body.facts.compensation === 'COMPLETE');
  if (body.outcome === 'CANCELLED_BEFORE_EFFECT') assert.ok(!has('step-intent') && !has('step-effect'));
  if (body.outcome === 'CANCELLED_PARTIAL') assert.ok(o.standing.length >= 1);
  if (body.outcome === 'CANCEL_TOO_LATE') assert.ok(has('action-completed') && o.reversed.length === 0 && o.standing.length === body.facts.totalSteps);
  if (!(body.outcome === 'COMPENSATED' || o.reversed.length)) {
    const text = allowedNegations.reduce((out, pattern) => out.replace(pattern, ''), body.statement);
    assert.doesNotMatch(text, /undone|rolled back|reversed|compensated|undo/i, `statement overstates: ${body.statement}`);
  }
}

module.exports = Object.freeze({ attribution, OUTCOMES, engineModule, scratch, sequence, clock, withTimeout, makeGates, startCmd, cancelCmd, reconcileCmd,
  boot, startAction, wait, types, decisions, actionOf, oracle, assertHonest, root });
