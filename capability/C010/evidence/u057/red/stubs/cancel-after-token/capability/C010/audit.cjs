'use strict';

// The audit log: one ring per identified subject and, apart, one ring for refusals that came without an identity, so that neither a flood of
// anonymous requests nor one identity's denials can evict the record of another identity (C009 F5, F11). Entries hold only values the server
// chose (subject, role, route name, method class, outcome, code): never an id, a name or a header of the client.
function createAudit({ perSubject, anonymous }) {
  const rings = new Map();
  let loose = [];
  let sequence = 0;
  return {
    record(entry) {
      sequence += 1;
      const stored = Object.freeze({ seq: sequence, ...entry });
      if (stored.subject === null) loose = [...loose, stored].slice(-anonymous);
      else rings.set(stored.subject, [...(rings.get(stored.subject) || []), stored].slice(-perSubject));
      return stored;
    },
    log: () => [...rings.values()].flat().concat(loose).sort((first, second) => first.seq - second.seq).map((stored) => ({ ...stored }))
  };
}

module.exports = Object.freeze({ createAudit });
