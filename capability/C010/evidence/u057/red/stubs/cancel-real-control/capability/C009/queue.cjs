'use strict';

// Runs tasks strictly one after another in arrival order. A task that throws never stalls the tasks behind it.
function createQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    size: () => pending,
    run(task) {
      pending += 1;
      const result = tail.then(task);
      tail = result.then(() => { pending -= 1; }, () => { pending -= 1; });
      return result;
    }
  };
}

module.exports = Object.freeze({ createQueue });
