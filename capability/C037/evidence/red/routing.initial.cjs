'use strict';

async function open() {
  return {
    async compareText(text) {
      const input = JSON.parse(text);
      return {
        disposition: 'MATCH',
        observed: { started: 10, known: 10,
          destinations: input.requested.targets.map((target) => ({
            destination: target.destination, count: target.weightBps / 1000
          })) }
      };
    }
  };
}
module.exports = Object.freeze({ open });
