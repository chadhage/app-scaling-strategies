'use strict';

// Original loadable stub. It is the naive evaluation this card exists to prevent:
// any client that ever touched version 2.0.0 is counted as migrated, and every client is in the denominator.
module.exports = Object.freeze({
  evaluateFleet(fleet) {
    const clients = fleet.clients.map((client) => ({
      clientId: client.clientId,
      classification: client.events.some((event) => event.version === '2.0.0') ? 'ACTUAL_TRANSITION' : 'NOT_TRANSITIONED_YET'
    }));
    return {
      valid: true,
      clients,
      counts: { unchanged: 0, failedOrUnknown: 0 },
      successRate: {
        numerator: clients.filter((client) => client.classification === 'ACTUAL_TRANSITION').length,
        denominator: clients.length
      }
    };
  }
});
