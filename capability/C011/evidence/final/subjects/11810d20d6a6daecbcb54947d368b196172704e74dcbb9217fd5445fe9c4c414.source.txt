'use strict';

// Every typed answer C011 can give: code -> [HTTP status, fixed message]. Messages never echo client input and never depend on the target or on the
// books of another lease. What C009 already says (credentials, role, body, URL, Node's own answers) is taken from the accepted C009 table.
const { CODES: shared } = require('../C009/codes.cjs');

const REUSED = [
  'AUTHENTICATION_REQUIRED', 'TOKEN_MALFORMED', 'TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'COMMAND_UNKNOWN', 'ROLE_FORBIDDEN', 'QUERY_NOT_ALLOWED', 'MEDIA_TYPE_UNSUPPORTED',
  'BODY_TOO_LARGE', 'BODY_INVALID_JSON', 'BODY_NOT_OBJECT', 'IDENTITY_CLAIM_REJECTED', 'INPUT_UNKNOWN_FIELD', 'INPUT_MISSING_FIELD', 'INPUT_INVALID',
  'METHOD_NOT_ALLOWED', 'UNEXPECTED_BODY', 'URL_TOO_LONG', 'INVALID_URL', 'NOT_FOUND', 'LOCAL_HOST_REQUIRED', 'CROSS_ORIGIN_DENIED', 'EXPECTATION_FAILED',
  'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'REQUEST_TIMEOUT', 'INTERNAL_ERROR'
];
// The five bounds each have a code of their own, so that a refusal names WHICH bound: a number that is not the caller's own is never shown.
const OWN = {
  RESERVATION_NOT_FOUND: [404, 'No such reservation is available to this identity.'],
  IDEMPOTENCY_CONFLICT: [409, 'That idempotency key was used with another body; nothing was changed.'],
  RESERVATION_LIMIT_REACHED: [409, 'The lease already holds its maximum number of active reservations; nothing was changed.'],
  LEASE_CAP_EXCEEDED: [409, 'The reservation would exceed the capacity cap of this lease; nothing was changed.'],
  LEASE_SPEND_CAP_EXCEEDED: [409, 'The reservation would exceed the spend cap of this lease; nothing was changed.'],
  CAPACITY_EXCEEDED: [409, 'The shared pool has not enough free capacity; nothing was changed.'],
  SPEND_EXCEEDED: [409, 'The shared spend ceiling would be exceeded; nothing was changed.'],
  QUERY_REJECTED: [400, 'A query parameter is not accepted or is out of range.'],
  SERVER_FIELD_REJECTED: [400, 'That field is owned by the server and cannot be set.']
};

const CODES = Object.freeze({ ...Object.fromEntries(REUSED.map((code) => [code, shared[code]])), ...OWN });

module.exports = Object.freeze({ CODES });
