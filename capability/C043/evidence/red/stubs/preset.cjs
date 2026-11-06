'use strict';

// RED subject: a behaviorless stub of the preset contract (it parses nothing and accepts nothing).
module.exports = Object.freeze({
  LIMITS: Object.freeze({ steps: 8 }),
  CATALOG: Object.freeze([]),
  parsePreset: () => ({ ok: false, code: 'NOT_IMPLEMENTED', problems: [] }),
  digestPreset: () => '0'.repeat(64),
});
