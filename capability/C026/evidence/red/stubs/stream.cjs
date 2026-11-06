'use strict';

// Loadable RED stub: connections accept input and say nothing; no session is ever created.
module.exports = Object.freeze({
  cursorFor(sessionId, seq) { return `${sessionId}:${seq}`; },
  createHub() {
    return Object.freeze({
      connect() { return Object.freeze({ receive() {}, disconnected() {} }); },
      inspect() { return null; }
    });
  }
});
