(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C020/contract.js'), require('../C020/inspector.js'));
  } else {
    Object.defineProperty(root, 'C021Compatibility', { value: factory(root.C020Contract, root.C020Inspector) });
  }
}(globalThis, function (contract, inspector) {
  'use strict';

  return Object.freeze({
    newContract: 'getProfile/2',
    adapterId: 'C021/getProfile-2-to-1/r1',
    oldConsumer: inspector && inspector.oldConsumer,
    makeBreaking() {},
    newConsumer() {},
    adaptToOld() {},
    rehearse() {},
    parseCandidate() {}
  });
}));
