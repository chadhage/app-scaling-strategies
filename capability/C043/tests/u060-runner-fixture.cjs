'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const CURRENT = 'capability\\C043\\tests\\mutants.test.cjs';
const ORIGINAL = 'capability\\C043\\evidence\\u060\\superseded\\tests\\mutants.test.cjs.txt';
const repository = path.resolve(__dirname, '..', '..', '..');

function subject(relative = CURRENT, scenario = 'timeout-named') {
  const testCalls = [];
  const children = [];
  const env = { C043_MUTANTS_ONLY: 'R6', NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'caller-owned' };
  const spawn = (executable, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.destroy = () => {};
    child.stderr.destroy = () => {};
    child.pid = 1000 + children.length;
    child.kill = () => {
      child.emit('exit', null, 'SIGTERM');
      if (scenario !== 'open-pipe') child.emit('close', null, 'SIGTERM');
      return true;
    };
    children.push({ child, executable, args, options });
    queueMicrotask(() => {
      child.emit('spawn');
      if (scenario === 'timeout-named') child.stdout.emit('data', Buffer.from('TAP version 13\nnot ok 1 - stops at the first refused step\n  code: ERR_ASSERTION\n'));
      else if (scenario === 'control') {
        child.stdout.emit('data', Buffer.from('TAP version 13\nok 1 - stops at the first refused step\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n# cancelled 0\n'));
        child.emit('exit', 0, null); child.emit('close', 0, null);
      }
    });
    return child;
  };
  const timers = {
    setTimeout(callback) { const token = { cancelled: false }; queueMicrotask(() => { if (!token.cancelled) callback(); }); return token; },
    clearTimeout(token) { if (token) token.cancelled = true; },
  };
  const processFixture = { env, execPath: 'fixture-node', pid: 99 };
  const resolve = (name) => {
    if (name === 'node:test') return (title, options, callback) => testCalls.push({ title, options, callback });
    if (name === 'node:child_process') return { spawn };
    if (name === './u060-mutation-runner.cjs') {
      const implementation = require('./u060-mutation-runner.cjs');
      return {
        ...implementation,
        createRunner: () => implementation.createRunner({
          spawn, env, executable: 'fixture-node', selfPid: 99,
          setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
          register: async () => ({ entries: [{ pid: 1000, createdAt: '1' }] }),
          cleanup: async () => ({ clean: true }), progress() {},
        }),
      };
    }
    if (['node:fs', 'node:path', 'node:assert/strict'].includes(name)) return require(name);
    throw new Error(`UNEXPECTED_U060_FIXTURE_IMPORT ${name}`);
  };
  const source = fs.readFileSync(path.join(repository, relative), 'utf8');
  const load = vm.compileFunction(source + '\nreturn { runNode, focused, testCalls };\n',
    ['require', 'process', '__dirname', 'setTimeout', 'clearTimeout', 'testCalls'], { filename: CURRENT });
  const result = load(resolve, processFixture, path.join(repository, 'capability', 'C043', 'tests'),
    timers.setTimeout, timers.clearTimeout, testCalls);
  return { ...result, children };
}

async function assertNoTimeoutKill(relative = CURRENT) {
  const loaded = subject(relative);
  const mutation = loaded.testCalls.find((entry) => entry.title.includes('every mutation matches'));
  assert.ok(mutation, 'the actual retained full mutation callback is loaded');
  await assert.rejects(mutation.callback, /TIMEOUT|UNDECIDED/,
    'a timed-out child with a named partial assertion must remain undecided, never a killed mutant');
  return loaded;
}

module.exports = { CURRENT, ORIGINAL, subject, assertNoTimeoutKill };
