"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.S031Session = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  function startRehearsal(mode) {
    return { ok: true, state: { mode, attempts: [], trace: [] } };
  }

  function visit(state) {
    return {
      ok: true,
      state,
      report: { httpStatus: 200, outcome: "unknown", observedProfile: null }
    };
  }

  return { startRehearsal, visit };
});
