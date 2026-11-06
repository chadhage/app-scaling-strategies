'use strict';

// Every typed answer C010 can give: code -> [HTTP status, fixed message]. Messages never echo client input and never depend on the target.
// What C009 already says (credentials, role, body, URL, Node's own answers) is taken from the accepted C009 table, so the wording stays one.
const { CODES: shared } = require('../C009/codes.cjs');

const REUSED = [
  'AUTHENTICATION_REQUIRED', 'TOKEN_MALFORMED', 'TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'COMMAND_UNKNOWN', 'ROLE_FORBIDDEN', 'QUERY_NOT_ALLOWED', 'MEDIA_TYPE_UNSUPPORTED',
  'BODY_TOO_LARGE', 'BODY_INVALID_JSON', 'BODY_NOT_OBJECT', 'IDENTITY_CLAIM_REJECTED', 'INPUT_UNKNOWN_FIELD', 'INPUT_MISSING_FIELD', 'INPUT_INVALID', 'OWNER_QUOTA_FULL',
  'METHOD_NOT_ALLOWED', 'UNEXPECTED_BODY', 'URL_TOO_LONG', 'INVALID_URL', 'NOT_FOUND', 'LOCAL_HOST_REQUIRED', 'CROSS_ORIGIN_DENIED', 'EXPECTATION_FAILED',
  'REQUEST_MALFORMED', 'HEADERS_TOO_LARGE', 'REQUEST_TIMEOUT', 'INTERNAL_ERROR'
];
const OWN = {
  TARGET_NOT_FOUND: [404, 'No such target is available to this identity.'],
  STATE_CONFLICT: [409, 'The target is in a state that does not allow this; nothing was changed.'],
  QUERY_REJECTED: [400, 'A query parameter is not accepted or is out of range.'],
  SERVER_FIELD_REJECTED: [400, 'That field is owned by the server and cannot be set.']
};

const CODES = Object.freeze({ ...Object.fromEntries(REUSED.map((code) => [code, shared[code]])), ...OWN });

module.exports = Object.freeze({ CODES });
