'use strict';

// The books of the pool: the ONLY place that decides who holds what and the only place the numbers change. Every function takes the subject of the
// verified token first and can reach nothing that subject does not hold: a reservation of another lease, an absent one and one that was trimmed
// from the history are the same `null` to everything above this file (the lookups scan the caller's own records only, so the work is the same).
// A mutation is ONE synchronous step: time is applied first (every reservation whose deadline has come is returned, once), then the decision and
// the commit run on a private draft that is kept only when the change succeeds, so a refusal, a conflict or a failed batch has no effect, and no
// await can come between the check and the commit. Conservation after every step: pool = reserved + free, for capacity units and for cost units;
// the units and spend of a lease never exceed its caps; every number is a non-negative safe integer.
const { randomBytes } = require('node:crypto');
const contract = require('./contract.js');

const ok = (value) => ({ ok: true, value });
const refusal = (code) => Object.freeze({ ok: false, code });
const MISSING = refusal('RESERVATION_NOT_FOUND');
const CONFLICT = refusal('IDEMPOTENCY_CONFLICT');
const NO_LEASE = refusal('ROLE_FORBIDDEN');

const view = (record) => ({ id: record.id, tier: record.tier, units: record.units, spend: record.spend, state: record.state, createdAtMs: record.createdAtMs, deadlineMs: record.deadlineMs });
const isHeld = (record) => record.state === 'reserved';

function createStore({ config, now = Date.now, newId = () => `rsv-${randomBytes(8).toString('hex')}` }) {
  let state = {
    reserved: { units: 0, spend: 0 },
    leases: Object.fromEntries(contract.conductors.map((subject) => [subject, { held: { units: 0, spend: 0 }, records: [] }]))
  };
  let visited = 0;
  const unreported = [];
  const leaseOf = (data, subject) => (Object.hasOwn(data.leases, subject) ? data.leases[subject] : null);
  const recordsOf = (data, subject) => leaseOf(data, subject)?.records ?? [];
  // A full pass and no early exit: finding a record and not finding it cost the same work (counted in `visited`, asserted by the tests).
  const pick = (list, test) => {
    let found = null;
    for (const item of list) {
      visited += 1;
      if (test(item)) found = item;
    }
    return found;
  };
  const figures = (data, subject) => {
    const lease = leaseOf(data, subject);
    return lease === null ? null : { units: lease.held.units, spend: lease.held.spend, poolUnits: data.reserved.units, poolSpend: data.reserved.spend };
  };
  // The one place a reservation gives back what it holds: release and expiry both end here, so the books move by exactly what was reserved, once.
  function close(data, lease, record, to) {
    record.state = to;
    lease.held.units -= record.units;
    lease.held.spend -= record.spend;
    data.reserved.units -= record.units;
    data.reserved.spend -= record.spend;
  }
  // Time is a fact of the books: it is applied before every decision, whether or not the request succeeds, and reported once (`unreported` is only
  // emptied by an answer, so an expiry that a failing step could not report stays queued for the next one).
  function settle(at) {
    for (const subject of contract.conductors) {
      const lease = state.leases[subject];
      for (const record of lease.records.filter((entry) => isHeld(entry) && at >= entry.deadlineMs)) {
        const before = figures(state, subject);
        close(state, lease, record, 'expired');
        unreported.push({ subject, reservation: record.id, before, after: figures(state, subject) });
      }
    }
  }
  function mint(draft) {
    const id = newId();
    if (!contract.isId(id) || contract.conductors.some((subject) => recordsOf(draft, subject).some((record) => record.id === id))) {
      throw Object.assign(new Error('The id generator returned an invalid or a used id'), { code: 'ID_GENERATOR_INVALID' });
    }
    return id;
  }
  // The bounds in a fixed order, the lease's own first: a caller that is over its own cap learns nothing about the pool of the other leases.
  function exceeded(draft, subject, lease, units, spend) {
    const cap = config.caps[subject];
    if (lease.records.filter(isHeld).length >= config.maxActive) return 'RESERVATION_LIMIT_REACHED';
    if (lease.held.units + units > cap.units) return 'LEASE_CAP_EXCEEDED';
    if (lease.held.spend + spend > cap.spend) return 'LEASE_SPEND_CAP_EXCEEDED';
    if (draft.reserved.units + units > config.pool.units) return 'CAPACITY_EXCEEDED';
    if (draft.reserved.spend + spend > config.pool.spend) return 'SPEND_EXCEEDED';
    return null;
  }

  const OPS = {
    reserve(draft, subject, at, { key, tier, units }) {
      const lease = leaseOf(draft, subject);
      if (lease === null) return NO_LEASE;
      const digest = `${tier}:${units}`;
      const known = pick(lease.records, (record) => record.key === key);
      if (known !== null) return known.digest === digest ? ok({ reservation: view(known), replayed: true }) : CONFLICT;
      const spend = units * config.prices[tier];
      const refused = exceeded(draft, subject, lease, units, spend);
      if (refused !== null) return refusal(refused);
      const record = { id: mint(draft), key, digest, tier, units, spend, state: 'reserved', createdAtMs: at, deadlineMs: at + config.ttlMs };
      lease.records.push(record);
      lease.held.units += units;
      lease.held.spend += spend;
      draft.reserved.units += units;
      draft.reserved.spend += spend;
      // The history is bounded: the oldest ended reservation goes first (there always is one: entries > maxActive).
      while (lease.records.length > config.entries) lease.records.splice(lease.records.findIndex((entry) => !isHeld(entry)), 1);
      return ok({ reservation: view(record), replayed: false });
    },
    release(draft, subject, at, { id }) {
      const lease = leaseOf(draft, subject);
      const record = lease === null ? null : pick(lease.records, (entry) => entry.id === id);
      if (record === null) return MISSING;
      const held = isHeld(record);
      if (held) close(draft, lease, record, 'released');
      return ok({ reservation: view(record), replayed: !held });
    }
  };

  // The one place the books change: time first, then a private draft kept only when the change succeeds.
  function mutate(subject, change) {
    const at = now();
    settle(at);
    const before = figures(state, subject);
    const draft = structuredClone(state);
    const outcome = change(draft, at);
    if (outcome.ok) state = draft;
    return { ...outcome, expired: unreported.splice(0), figures: { before, after: figures(state, subject) } };
  }
  const observe = (build) => {
    settle(now());
    return { ...build(state), expired: unreported.splice(0) };
  };
  const active = (lease) => lease.records.filter(isHeld).length;

  return Object.freeze({
    reserve: (subject, input) => mutate(subject, (draft, at) => OPS.reserve(draft, subject, at, input)),
    release: (subject, id) => mutate(subject, (draft, at) => OPS.release(draft, subject, at, { id })),
    // All or nothing: the first operation that fails ends the batch with its index and the draft is dropped.
    batch: (subject, ops) => mutate(subject, (draft, at) => {
      const results = [];
      for (const [index, operation] of ops.entries()) {
        const outcome = OPS[operation.op](draft, subject, at, operation);
        if (!outcome.ok) return { ...outcome, opIndex: index };
        results.push({ op: operation.op, ...outcome.value });
      }
      return ok({ results });
    }),
    read: (subject, id) => observe((data) => {
      const record = pick(recordsOf(data, subject), (entry) => entry.id === id);
      return record === null ? MISSING : ok({ reservation: view(record) });
    }),
    list: (subject, { limit, offset, state: wanted }) => observe((data) => {
      const own = recordsOf(data, subject).filter((record) => wanted === null || record.state === wanted);
      return ok({ total: own.length, offset, limit, items: own.slice(offset, offset + limit).map(view) });
    }),
    // The caller's own caps and holdings; the pool total is the fixed figure of the configuration and the free headroom of the pool is not shown.
    allowance: (subject) => observe((data) => {
      const lease = leaseOf(data, subject);
      if (lease === null) return NO_LEASE;
      const cap = config.caps[subject];
      return ok({
        allowance: {
          pool: { units: config.pool.units, spend: config.pool.spend },
          lease: {
            capUnits: cap.units, capSpend: cap.spend, heldUnits: lease.held.units, heldSpend: lease.held.spend, remainingUnits: cap.units - lease.held.units,
            remainingSpend: cap.spend - lease.held.spend, active: active(lease), maxActive: config.maxActive
          },
          prices: { version: contract.priceVersion, ...config.prices }, ttlMs: config.ttlMs
        }
      });
    }),
    operatorPool: () => observe((data) => ok({
      pool: {
        units: config.pool.units, spend: config.pool.spend, reservedUnits: data.reserved.units, reservedSpend: data.reserved.spend,
        freeUnits: config.pool.units - data.reserved.units, freeSpend: config.pool.spend - data.reserved.spend
      },
      leases: contract.conductors.map((subject) => {
        const lease = data.leases[subject];
        return { subject, capUnits: config.caps[subject].units, capSpend: config.caps[subject].spend, heldUnits: lease.held.units, heldSpend: lease.held.spend, active: active(lease) };
      })
    })),
    // The decision before the effect (no change): does this subject hold a reservation with this id, in any state?
    has: (subject, id) => pick(recordsOf(state, subject), (entry) => entry.id === id) !== null,
    snapshot: () => structuredClone(state),
    stats: () => ({ visited })
  });
}

module.exports = Object.freeze({ createStore });
