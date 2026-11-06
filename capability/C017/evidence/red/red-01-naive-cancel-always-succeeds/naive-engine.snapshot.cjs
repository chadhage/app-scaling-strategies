'use strict';

// RED subject (retained evidence, never production code): a naive engine that runs the steps and answers every cancel
// with success. It never defers to a step boundary, never lists which effects stand, ignores keys, identity and epochs,
// and keeps no persisted journal. The C017 tests must fail against it for behavioral reasons.
function createEngine(options) {
  const { steps = 4, unitsPerStep = 5, gates = {}, ids = () => '00000001' } = options;
  const journal = [];
  let action = null;
  let running = null;
  const gate = async (name, step) => { if (gates[name]) await gates[name](step); };
  async function run() {
    for (let step = 1; step <= steps; step += 1) {
      await gate('beforeStep', step);
      journal.push({ type: 'step-intent', actionId: action.actionId, step });
      await gate('inStep', step);
      journal.push({ type: 'step-effect', actionId: action.actionId, step, units: unitsPerStep });
    }
    journal.push({ type: 'action-completed', actionId: action.actionId });
    action.status = 'COMPLETED';
  }
  const engine = {
    async execute(command) {
      if (command.kind === 'start') {
        action = { actionId: `act-1-${ids()}`, epoch: 1, status: 'RUNNING', cancel: null, effectsStanding: [] };
        running = run();
        return { status: 202, body: { kind: 'C017-start-result', outcome: 'ACTION_ACCEPTED', action } };
      }
      if (action) action.cancel = { key: command.key };
      return { status: 200, body: { kind: 'C017-cancel-result', outcome: 'CANCELLED', cancelled: true, statement: 'Cancelled.' } };
    },
    view() { return { action, journal: journal.slice() }; },
    async waitFor() { return engine.view(); },
    async settled() { return running; },
    async close() {},
  };
  return engine;
}

module.exports = Object.freeze({ createEngine });
