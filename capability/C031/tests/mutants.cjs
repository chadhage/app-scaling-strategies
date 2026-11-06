'use strict';

// Mutation check of evaluator.js: every textual mutant must be killed by the functional suites, so the tests measure behavior.
// Runner: node capability\C031\tests\mutants.cjs [mutant-name ...]   (about 2 minutes; nothing is written, mutants are compiled in memory)
// The same file is the --require preload of each child run, selected by C031_MUTANT_NAME. The mutation replaces the FIRST occurrence.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { childEnvironment } = require('.\\nested-runner.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const evaluatorPath = path.join(root, 'evaluator.js');
const m = (name, find, replace) => ({ name, find, replace });
const mutants = [
  m('identity', 'const banner =', 'const banner ='),
  m('eligible-ignores-old-traffic', 'const eligible = start !== NEW || touchedOld;', 'const eligible = start !== NEW;'),
  m('unproven-start-excluded', 'const eligible = start !== NEW || touchedOld;', 'const eligible = start === OLD;'),
  m('unchanged-counts-in-numerator', "countsInNumerator: outcome.classification === 'ACTUAL_TRANSITION'", "countsInNumerator: outcome.classification === 'ACTUAL_TRANSITION' || outcome.classification === 'UNCHANGED'"),
  m('stale-check-off', "else if (event.issuedAt < request.at) stop('STALE_ACKNOWLEDGMENT');", "else if (false) stop('STALE_ACKNOWLEDGMENT');"),
  m('issued-after-receipt-off', "else if (event.issuedAt > event.at) stop('ACK_ISSUED_AFTER_RECEIPT');", ''),
  m('duplicate-ack-off', "if (request.acked) stop('DUPLICATE_ACK');", ''),
  m('time-equal-rejected', "if (event.at < lastAt) stop('NON_MONOTONIC_TIME');", "if (event.at <= lastAt) stop('NON_MONOTONIC_TIME');"),
  m('stamp-check-off', 'if (event.deploymentStamp !== stamps[event.version]) stop', 'if (false) stop'),
  m('version-mismatch-off', "if (event.version !== request.version) stop('ACK_VERSION_MISMATCH');", ''),
  m('regress-ignores-ack', 'event.version === OLD && (start === NEW || state.newAck)', 'event.version === OLD && start === NEW'),
  m('state-before-ack-off', "if (start === OLD && event.version === NEW && !state.newAck) stop('STATE_BEFORE_ACKNOWLEDGMENT');", ''),
  m('transition-without-followup', 'if (walked.newAck && walked.followUp) {', 'if (walked.newAck) {'),
  m('old-request-not-required', 'return walked.oldRequest ? {', 'return true ? {'),
  m('unacked-new-request-ignored', '[...walked.requests.values()].some((request) => request.version === NEW && !request.acked && !request.failed)', 'false'),
  m('empty-rate-is-100', "percent: denominator ? `${(basisPoints / 100).toFixed(2)}%` : null", "percent: denominator ? `${(basisPoints / 100).toFixed(2)}%` : '100.00%'"),
  m('percent-ceil', 'Math.round((numerator * 10000) / denominator)', 'Math.ceil((numerator * 10000) / denominator)'),
  m('eligible-count-all', 'eligible: count((row) => row.eligible)', 'eligible: count((row) => true)'),
  m('duplicates-always-same', 'const same = group.copies.every((copy) => canonical(copy) === canonical(group.copies[0]));', 'const same = true;'),
  m('dup-request-id-off', "if (requests.has(event.requestId)) stop('DUPLICATE_REQUEST_ID');", ''),
  m('action-after-terminal-off', "if (state.terminal) stop('ACTION_AFTER_TERMINAL');", ''),
  m('seq-zero-allowed', 'Number.isSafeInteger(value) && value >= 1', 'Number.isSafeInteger(value)'),
  m('time-unbounded', 'value >= 0 && value <= MAX_TIME', 'value >= 0'),
  m('more-clients', 'const MAX_CLIENTS = 512;', 'const MAX_CLIENTS = 1024;'),
  m('proto-only-guard', "['__proto__', 'constructor', 'prototype'].includes(name)", "['__proto__'].includes(name)"),
  m('start-by-array-order', "if (Object.hasOwn(event, 'version') && (first === null || event.seq < first.seq)) first = event;", "if (Object.hasOwn(event, 'version') && first === null) first = event;"),
  m('ack-keeps-latest-newack', 'if (event.version === NEW && !state.newAck) {', 'if (event.version === NEW) {'),
  m('followup-takes-latest', 'state.newAck && event.version === NEW && !state.followUp', 'state.newAck && event.version === NEW'),
  m('old-request-takes-latest', 'if (event.version === OLD && !state.oldRequest)', 'if (event.version === OLD)'),
  m('gap-reported-as-order', "'OUT_OF_ORDER_SEQUENCE' : 'SEQUENCE_GAP'", "'OUT_OF_ORDER_SEQUENCE' : 'OUT_OF_ORDER_SEQUENCE'"),
  m('terminal-after-transition-dropped', "if (outcome.classification === 'ACTUAL_TRANSITION' && walked.terminal) notes.push('TERMINAL_AFTER_TRANSITION_EVIDENCE');", ''),
  m('held-note-dropped', "if (outcome.classification === 'NOT_TRANSITIONED_YET' && walked.held) notes.push('HELD_AT_BOUNDARY');", ''),
  m('budget-flag-trusted', 'extras.annotations.originalBudgetExceeded === true', 'extras.annotations.originalBudgetExceeded !== undefined'),
  m('failed-count-hidden', "failed: count((row) => row.failureKind === 'FAILED')", "failed: count((row) => row.failureKind === 'FAILED' && false)"),
  m('freeze-off', 'Object.values(value).forEach(freeze); Object.freeze(value);', 'Object.values(value).forEach(freeze);'),
  m('adapter-invents-issue-time', 'reply.stamp.deploymentStamp : null, issuedAt: null', 'reply.stamp.deploymentStamp : null, issuedAt: event.at'),
  m('adapter-state-first-reply', 'version: versionOf(replies[replies.length - 1])', 'version: versionOf(replies[0])'),
  m('summary-client-dropped', "if (trace.id === 'closed-history' && plain(summary)", "if (false && plain(summary)"),
  m('compare-allows-non-negative', "if (entry.group !== 'negative') fail('COMPARISON_REQUIRES_NEGATIVE_FLEET');", ''),
  m('changed-clients-ignores-copies', 'earlier.traceCopies !== row.traceCopies', 'false'),
  m('decision-ignores-numerator', "decision: rateRaised || numeratorIncreased ? 'RAISED' : 'NOT_RAISED'", "decision: rateRaised ? 'RAISED' : 'NOT_RAISED'"),
  m('rate-raised-uses-gte', 'after.successRate.numerator * before.successRate.denominator > before.successRate.numerator * after.successRate.denominator',
    'after.successRate.numerator * before.successRate.denominator >= before.successRate.numerator * after.successRate.denominator')
];
const mutated = (mutant) => {
  const source = fs.readFileSync(evaluatorPath, 'utf8');
  const at = source.indexOf(mutant.find);
  if (at < 0) throw new Error(`stale mutant, text not found: ${mutant.name}`);
  return source.slice(0, at) + mutant.replace + source.slice(at + mutant.find.length);
};

if (process.env.C031_MUTANT_NAME) {
  const mutant = mutants.find((item) => item.name === process.env.C031_MUTANT_NAME);
  const holder = { exports: {} };
  new vm.Script(`(function (module, exports) {${mutated(mutant)}\n})`, { filename: evaluatorPath }).runInThisContext()(holder, holder.exports);
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (parent && parent.filename && /evaluator\.js$/.test(request) && path.resolve(path.dirname(parent.filename), request) === evaluatorPath) return holder.exports;
    return original.call(this, request, parent, isMain);
  };
} else {
  const suites = ['evaluator', 'catalog', 'properties', 'denominator', 'hostile'].map((name) => path.join('capability', 'C031', 'tests', `${name}.test.cjs`));
  const chosen = process.argv.slice(2);
  const survivors = [];
  for (const mutant of mutants.filter((item) => !chosen.length || chosen.includes(item.name))) {
    const run = spawnSync(process.execPath, ['--require', __filename, '--test', '--test-concurrency=1', '--test-reporter=tap', ...suites], {
      cwd: repository, env: { ...childEnvironment(), C031_MUTANT_NAME: mutant.name }, encoding: 'utf8', windowsHide: true, timeout: 120000
    });
    const failed = Number(/^# fail (\d+)/m.exec(run.stdout)?.[1]);
    const expected = mutant.name === 'identity' ? run.status === 0 : run.status !== 0 && failed > 0;
    console.log(`${expected ? 'ok      ' : 'WRONG   '} ${mutant.name}: ${mutant.name === 'identity' ? 'unchanged code passes' : `killed by ${failed} failing test(s)`}`);
    if (!expected) survivors.push(mutant.name);
  }
  console.log(survivors.length ? `SURVIVORS OR BROKEN PRELOAD: ${survivors.join(', ')}` : 'ALL MUTANTS KILLED, identity passes');
  process.exitCode = survivors.length ? 1 : 0;
}
