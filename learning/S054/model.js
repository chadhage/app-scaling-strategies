(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./fixtures.js') : root.S054Fixtures);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S054Model = api;
}(typeof globalThis === 'object' ? globalThis : this, function (fixtures) {
  'use strict';
  const LIMITS = Object.freeze({ attempts: 6, events: 12, records: 4, oldConsumers: 4, oldWork: 3 });
  const issued = new WeakSet();
  const actions = new Set(['begin', 'expand', 'migrate', 'upgrade', 'drain', 'contract', 'newAttempt', 'reset']);

  function reject(message, field) {
    const error = new Error(message);
    if (field) error.field = field;
    throw error;
  }

  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  function issue(value) {
    freeze(value);
    issued.add(value);
    return value;
  }

  function configuration(input) {
    const keys = ['migration', 'observation', 'oldConsumers', 'oldWork'];
    if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype
        || Reflect.ownKeys(input).length !== keys.length
        || !keys.every((key) => Object.hasOwn(input, key)
          && Object.hasOwn(Object.getOwnPropertyDescriptor(input, key), 'value'))) {
      reject('Configuration requires exactly four own data fields.');
    }
    if (!['faithful', 'corrupt-first'].includes(input.migration)) reject('Migration must be a listed fixture.', 'migration');
    if (!['complete', 'partial', 'none'].includes(input.observation)) reject('Observation must be a listed fixture.', 'observation');
    if (!Number.isInteger(input.oldConsumers) || input.oldConsumers < 0 || input.oldConsumers > LIMITS.oldConsumers) {
      reject('Old consumers must be an integer from 0 to 4.', 'old-consumers');
    }
    if (!Number.isInteger(input.oldWork) || input.oldWork < 0 || input.oldWork > LIMITS.oldWork) {
      reject('Old work must be an integer from 0 to 3.', 'old-work');
    }
    return { ...input };
  }

  function createLesson() {
    return issue({ current: null, history: [] });
  }

  function checkReads(attempt) {
    const readers = attempt.phase === 'contracted' ? ['new'] : ['old', 'new'];
    const reads = fixtures.flatMap((fixture, index) => readers.map((reader) => {
      const observed = attempt.config.observation === 'complete'
        || (attempt.config.observation === 'partial' && index === 0);
      if (!observed) return {
        id: fixture.id, reader, expected: fixture.label, actual: null, status: 'UNKNOWN', reason: 'not observed',
      };
      const row = attempt.rows[index];
      const fallback = reader === 'new' && attempt.phase === 'expanded' && row.modernLabel === null;
      const actual = reader === 'old' || fallback ? row.legacyLabel : row.modernLabel;
      const status = actual === fixture.label ? 'PASS' : 'FAIL';
      return {
        id: fixture.id, reader, expected: fixture.label, actual, status,
        reason: status === 'FAIL' ? 'required label mismatch'
          : fallback ? 'legacy fallback preserved the new bridge reader' : 'expected label preserved',
      };
    }));
    const passed = reads.filter((read) => read.status === 'PASS').length;
    const failed = reads.filter((read) => read.status === 'FAIL').length;
    const unknown = reads.length - passed - failed;
    return {
      gate: failed ? 'FAIL' : unknown ? 'UNKNOWN' : 'PASS',
      expected: reads.length, observed: passed + failed, passed, failed, unknown, reads,
    };
  }

  function append(attempt, action, gate, decision, message, impact) {
    return {
      ...attempt,
      events: [...attempt.events, {
        step: attempt.events.length + 1, action, phase: attempt.phase, gate, decision, message, impact,
        oldConsumers: attempt.oldConsumers, newConsumers: attempt.newConsumers, oldWork: attempt.oldWork,
        completedOldWork: attempt.completedOldWork, copiedRows: attempt.copiedRows,
        observed: attempt.check?.observed || 0, passed: attempt.check?.passed || 0,
        failed: attempt.check?.failed || 0, unknown: attempt.check?.unknown || 0,
      }],
    };
  }

  function act(state, action, input) {
    if (!state || !issued.has(state)) reject('State must be an issued immutable S054 lesson.');
    if (!actions.has(action)) reject('Action must be one of the declared lesson commands.');
    if (action !== 'begin' && input !== undefined) reject('Unexpected action payload; configuration locks at start.');
    if (action === 'reset') return createLesson();
    if (action === 'begin') {
      if (state.current) reject('An attempt is already active; start a new attempt or reset.');
      if (state.history.length >= LIMITS.attempts) reject('History full; explicit reset is required.');
      const config = configuration(input);
      const current = append({
        id: state.history.length + 1, config, phase: 'baseline',
        rows: fixtures.map((fixture) => ({ id: fixture.id, legacyLabel: fixture.label })),
        oldConsumers: config.oldConsumers, newConsumers: 2, oldWork: config.oldWork, completedOldWork: 0,
        copiedRows: 0, check: null, migrationCheck: null, interrupted: false, events: [],
      }, action, 'NOT_EVALUATED', 'NOT_EVALUATED', 'Choices locked; legacy data retained. No transition yet.', 'NO_MIGRATION');
      return issue({ current, history: state.history });
    }
    if (!state.current) reject('Command requires an active attempt.');
    let current = state.current;
    if (action === 'newAttempt') {
      if (state.history.length + 1 >= LIMITS.attempts) reject('History full; six attempts retained. Explicit reset is required.');
      return issue({ current: null, history: [...state.history, current] });
    }
    if (current.phase === 'contracted') reject('Attempt is contracted; begin another attempt or reset.');
    if (current.events.length >= LIMITS.events) reject('Event limit reached; start another attempt or explicitly reset.');

    if (action === 'contract') {
      const reasons = [];
      let gate = 'FAIL';
      if (current.phase !== 'migrated') reasons.push('Sequence requires expand, then migrate before contract.');
      else if (current.migrationCheck.gate === 'FAIL') reasons.push('Observed failed migration reads prevent contraction.');
      else if (current.migrationCheck.gate === 'UNKNOWN') {
        reasons.push('Migration observations are incomplete; compatibility is unknown.');
        gate = 'UNKNOWN';
      }
      if (current.oldConsumers) reasons.push(`${current.oldConsumers} old consumers still depend on legacyLabel.`);
      if (current.oldWork) reasons.push(`${current.oldWork} old work items still depend on legacyLabel.`);
      if (reasons.length) {
        current = append(current, action, gate, 'BLOCKED', `${reasons.join(' ')} Old structure retained.`,
          current.interrupted ? 'INTERRUPTED' : gate === 'UNKNOWN' ? 'UNKNOWN' : 'SAFE_ABORT');
      } else {
        current = {
          ...current, phase: 'contracted',
          rows: current.rows.map((row) => ({ id: row.id, modernLabel: row.modernLabel })),
        };
        current.check = checkReads(current);
        current = append(current, action, current.check.gate, 'ALLOWED',
          'Verified migration; no dependent consumers or work. Old structure removed; new readers remain correct.',
          'UNINTERRUPTED');
      }
    } else if (action === 'expand') {
      if (current.phase !== 'baseline') reject('Expand requires baseline phase.');
      current = {
        ...current, phase: 'expanded',
        rows: current.rows.map((row) => ({ ...row, modernLabel: null })),
      };
      current.check = checkReads(current);
      current = append(current, action, current.check.gate, 'NOT_EVALUATED',
        'Added nullable modernLabel without removing legacyLabel; new readers use the legacy fallback.',
        current.check.gate === 'UNKNOWN' ? 'UNKNOWN' : 'NO_MIGRATION');
    } else if (action === 'migrate') {
      if (current.phase !== 'expanded') reject('Migrate requires expanded phase.');
      current = {
        ...current, phase: 'migrated', copiedRows: LIMITS.records,
        rows: current.rows.map((row, index) => ({
          ...row,
          modernLabel: current.config.migration === 'corrupt-first' && index === 0
            ? 'Wrong synthetic label' : row.legacyLabel,
        })),
      };
      current.check = checkReads(current);
      current.migrationCheck = current.check;
      current.interrupted = current.check.failed > 0;
      current = append(current, action, current.check.gate, 'NOT_EVALUATED',
        'Copied four records. Validate values through both reader contracts; a copied-row count is not correctness.',
        current.interrupted ? 'INTERRUPTED' : current.check.gate === 'UNKNOWN' ? 'UNKNOWN' : 'NO_MIGRATION');
    } else if (action === 'upgrade') {
      if (current.phase !== 'migrated') reject('Consumer upgrade requires migrated phase.');
      if (current.migrationCheck.gate !== 'PASS') reject('Consumer upgrade requires a fully verified migration.');
      if (!current.oldConsumers) reject('No old consumers remain to upgrade.');
      const count = current.oldConsumers;
      current = { ...current, oldConsumers: 0, newConsumers: current.newConsumers + count };
      current = append(current, action, 'PASS', 'NOT_EVALUATED',
        `Upgraded ${count} old consumers. Old work is independent and has not been silently completed.`, 'NO_MIGRATION');
    } else if (action === 'drain') {
      if (current.phase !== 'migrated') reject('Finishing old work requires migrated phase.');
      if (!current.oldWork) reject('No old work remains to finish.');
      const count = current.oldWork;
      current = { ...current, oldWork: 0, completedOldWork: current.completedOldWork + count };
      current = append(current, action, current.check.gate, 'NOT_EVALUATED',
        `Finished ${count} old work items against the retained legacy structure.`,
        current.interrupted ? 'INTERRUPTED' : current.check.gate === 'UNKNOWN' ? 'UNKNOWN' : 'NO_MIGRATION');
    }
    return issue({ current, history: state.history });
  }

  return Object.freeze({ createLesson, act, LIMITS });
}));
