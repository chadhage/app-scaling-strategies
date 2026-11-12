'use strict';
const fs = require('node:fs'), path = require('node:path');
const { AsyncLocalStorage } = require('node:async_hooks');
const storage = new AsyncLocalStorage(), api = require('node:test'), actualTest = api.test, rows = [];
for (const name of ['node:assert', 'node:assert/strict']) {
  const mod = require(name);
  for (const key of Object.keys(mod)) {
    if (typeof mod[key] !== 'function' || ['AssertionError', 'CallTracker'].includes(key) || /^assert$|^strict$/.test(key)) continue;
    const original = mod[key];
    if (original.__c047Audit) continue;
    function wrapped(...args) {
      const current = storage.getStore();
      if (current) { current.assertions++; if (typeof args.at(-1) === 'string') current.namedAssertions.push(args.at(-1)); }
      return original.apply(this, args);
    }
    Object.defineProperty(wrapped, '__c047Audit', { value: true });
    mod[key] = wrapped;
  }
}
api.test = function (...args) {
  const index = args.findLastIndex(arg => typeof arg === 'function'), callback = args[index];
  const options = args.find(arg => arg && typeof arg === 'object') || {};
  const row = { name: typeof args[0] === 'string' ? args[0] : callback?.name || 'unnamed', assertions: 0, namedAssertions: [], skip: Boolean(options.skip), todo: Boolean(options.todo) };
  rows.push(row);
  if (index >= 0) args[index] = function (...values) { return storage.run(row, () => callback.apply(this, values)); };
  return actualTest.apply(this, args);
};
process.once('beforeExit', () => {
  const executed = rows.filter(row => !row.skip && !row.todo), zero = executed.filter(row => row.assertions === 0);
  const report = { schema: 'C047-actual-assertions-per-executed-test/1', actualTests: rows.length, executedTests: executed.length, totalAssertions: rows.reduce((n, row) => n + row.assertions, 0),
    silentZeroAssertionTests: zero, silentZeroAssertionCount: zero.length, rows };
  if (process.env.C047_CAPTURE_DIR) fs.writeFileSync(path.join(process.env.C047_CAPTURE_DIR, 'assertion-census.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ assertionCensus: { executedTests: executed.length, silentZeroAssertionCount: zero.length, totalAssertions: report.totalAssertions } }));
  if (zero.length) process.exitCode = 1;
});
