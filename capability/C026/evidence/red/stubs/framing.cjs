'use strict';

// Loadable RED stub: the API exists but nothing behaves. The initial C026 tests must fail on assertions about
// the specified behavior, never on a missing module or a syntax error.
class FramingError extends Error {
  constructor(code, closeCode, message) {
    super(message ?? code);
    this.code = code;
    this.closeCode = closeCode;
  }
}

module.exports = Object.freeze({
  GUID: '',
  OPCODES: Object.freeze({}),
  FramingError,
  acceptKey() { return ''; },
  encodeFrame() { return Buffer.alloc(0); },
  encodeClose() { return Buffer.alloc(0); },
  parseClosePayload() { return { code: 1005, reason: '' }; },
  createParser() { return { push() { return []; } }; }
});
