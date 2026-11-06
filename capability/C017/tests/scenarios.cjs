'use strict';

// Test tooling, not production code: builds REAL journals by running the engine through each scenario, so tamper tests start
// from journals the production code actually wrote.
const s = require('./support.cjs');

async function build(name) {
  const ctx = s.boot(name === 'failedCompensation' ? { engine: { faults: { compensation: (step) => step === 1 } } } : {});
  const hold = { partial: ['before', 3], before: ['before', 1], compensated: ['before', 3], failedCompensation: ['before', 3], interrupted: ['in', 3], interruptedCancel: ['in', 3], reconciled: ['in', 3] }[name];
  if (hold) ctx.g.hold(...hold);
  const actionId = await s.startAction(ctx);
  if (!hold) await s.wait(ctx, (state) => state.action.status === 'COMPLETED');
  else await ctx.g.reached(...hold);
  const cancel = (key, compensate) => {
    const pending = ctx.engine.execute(s.cancelCmd(key, actionId, 1, compensate));
    return s.wait(ctx, (state) => Boolean(state.action.cancel)).then(() => pending);
  };
  if (['partial', 'before'].includes(name)) await cancel('build-cancel-01', false);
  if (['compensated', 'failedCompensation'].includes(name)) await cancel('build-cancel-01', true);
  if (name === 'completed') await ctx.engine.execute(s.cancelCmd('build-cancel-01', actionId));
  let crashed = null;
  if (['interrupted', 'interruptedCancel', 'reconciled'].includes(name)) {
    let pending = null;
    if (name === 'interruptedCancel') {
      pending = ctx.engine.execute(s.cancelCmd('build-cancel-01', actionId));
      await s.wait(ctx, (state) => Boolean(state.action.cancel));
    }
    await ctx.engine.close();
    if (pending) await pending;
    crashed = s.boot({ dir: ctx.dir });
    if (name === 'reconciled') await crashed.engine.execute(s.reconcileCmd('build-reconcile-01', actionId));
  }
  const final = crashed || ctx;
  const journal = final.engine.view().journal;
  await final.engine.close();
  ctx.made.remove();
  return { journal, actionId };
}

module.exports = Object.freeze({ build });
