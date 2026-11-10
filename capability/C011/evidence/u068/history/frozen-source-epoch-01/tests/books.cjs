'use strict';

// Test tooling, not production code: the conservation invariant and the ownership invariant of the books, computed from a snapshot of the store with
// nothing taken from the store's own counters except to compare them: pool = reserved + free, the spend ceiling likewise, the units and spend of a lease
// within its caps, every number a non-negative safe integer, every spend the units times the price, the history and the active set within their bounds.
const { CONDUCTORS } = require('./helpers.cjs');

const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const sum = (list, field) => list.reduce((total, item) => total + item[field], 0);

function booksProblems(snapshot, config) {
  const problems = [];
  let units = 0;
  let spend = 0;
  const ids = new Set();
  for (const subject of CONDUCTORS) {
    const lease = snapshot.leases[subject];
    const held = lease.records.filter((record) => record.state === 'reserved');
    const heldUnits = sum(held, 'units');
    const heldSpend = sum(held, 'spend');
    if (lease.held.units !== heldUnits || lease.held.spend !== heldSpend) problems.push(`${subject}: counters ${lease.held.units}/${lease.held.spend} but records ${heldUnits}/${heldSpend}`);
    if (heldUnits > config.caps[subject].units || heldSpend > config.caps[subject].spend) problems.push(`${subject}: over its caps`);
    if (held.length > config.maxActive || lease.records.length > config.entries) problems.push(`${subject}: active or retained records over the bound`);
    const keys = new Set();
    for (const record of lease.records) {
      if (![record.units, record.spend, record.createdAtMs, record.deadlineMs].every(isCount) || record.units < 1) problems.push(`${subject}: a number of ${record.id} is not a count`);
      if (record.spend !== record.units * config.prices[record.tier]) problems.push(`${subject}: ${record.id} has the wrong spend`);
      if (record.deadlineMs !== record.createdAtMs + config.ttlMs) problems.push(`${subject}: ${record.id} has the wrong deadline`);
      if (!['reserved', 'released', 'expired'].includes(record.state)) problems.push(`${subject}: ${record.id} has the state ${record.state}`);
      if (keys.has(record.key) || ids.has(record.id)) problems.push(`${subject}: a key or an id is used twice`);
      keys.add(record.key);
      ids.add(record.id);
    }
    units += heldUnits;
    spend += heldSpend;
  }
  if (snapshot.reserved.units !== units || snapshot.reserved.spend !== spend) problems.push(`pool counters ${snapshot.reserved.units}/${snapshot.reserved.spend} but leases hold ${units}/${spend}`);
  if (!isCount(snapshot.reserved.units) || !isCount(snapshot.reserved.spend) || units > config.pool.units || spend > config.pool.spend) problems.push('the pool is over its total or a counter is not a count');
  if (config.pool.units - snapshot.reserved.units < 0 || config.pool.spend - snapshot.reserved.spend < 0) problems.push('a free figure is negative');
  return problems;
}

// What time alone does to a snapshot: every reserved record whose deadline has come is expired. Used to compare a lease before and after an operation of ANOTHER lease.
function afterTime(snapshot, at) {
  const copy = structuredClone(snapshot);
  for (const subject of CONDUCTORS) {
    const lease = copy.leases[subject];
    for (const record of lease.records) {
      if (record.state !== 'reserved' || at < record.deadlineMs) continue;
      record.state = 'expired';
      lease.held.units -= record.units;
      lease.held.spend -= record.spend;
      copy.reserved.units -= record.units;
      copy.reserved.spend -= record.spend;
    }
  }
  return copy;
}
const recordsOf = (snapshot, subject) => structuredClone(snapshot.leases[subject].records);

module.exports = Object.freeze({ afterTime, booksProblems, recordsOf });
