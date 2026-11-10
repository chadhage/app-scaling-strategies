'use strict';

// Every typed error the fixture can answer with: code -> [HTTP status, fixed message]. Messages never echo client input.
const CODES = Object.freeze({
  AUTHENTICATION_REQUIRED: [401, 'A bearer token is required.'],
  TOKEN_MALFORMED: [401, 'Present exactly one well-formed bearer token.'],
  TOKEN_UNKNOWN: [401, 'This server did not issue that token.'],
  TOKEN_EXPIRED: [401, 'The token has expired.'],
  COMMAND_NAME_INVALID: [400, 'The command name is not well formed.'],
  COMMAND_UNKNOWN: [404, 'No such command exists; unlisted commands are denied.'],
  ROLE_FORBIDDEN: [403, 'The server-derived role may not send this command.'],
  QUERY_NOT_ALLOWED: [400, 'This route accepts no query parameters.'],
  QUERY_INVALID: [400, 'Exactly one well-formed command parameter is required.'],
  MEDIA_TYPE_UNSUPPORTED: [415, 'Commands must be sent as application/json.'],
  BODY_TOO_LARGE: [413, 'The body exceeds the size limit.'],
  BODY_INVALID_JSON: [400, 'The body is not valid JSON.'],
  BODY_NOT_OBJECT: [400, 'The body must be a JSON object.'],
  IDENTITY_CLAIM_REJECTED: [400, 'Identity comes from the token; a body that names one is refused.'],
  INPUT_UNKNOWN_FIELD: [400, 'The body has a field this command does not accept.'],
  INPUT_MISSING_FIELD: [400, 'A required field is missing.'],
  INPUT_INVALID: [400, 'A field is outside its type or bounds.'],
  ALREADY_APPROVED: [409, 'That experiment is already approved.'],
  STATE_FULL: [409, 'The fixture state is full; nothing was changed.'],
  OWNER_QUOTA_FULL: [409, 'This identity already holds its share of the state; nothing was changed.'],
  COMMAND_NOT_IMPLEMENTED: [501, 'The command is permitted but has no handler.'],
  COMMAND_FAILED: [500, 'The command failed and had no effect.'],
  METHOD_NOT_ALLOWED: [405, 'That method is not supported on this route.'],
  UNEXPECTED_BODY: [400, 'Read requests must not contain a body.'],
  URL_TOO_LONG: [414, 'The request URL is too long.'],
  INVALID_URL: [400, 'An explicit local URL without a fragment is required.'],
  NOT_FOUND: [404, 'No fixture route has that path.'],
  LOCAL_HOST_REQUIRED: [421, 'Only the actual 127.0.0.1 listener is supported.'],
  CROSS_ORIGIN_DENIED: [403, 'This synthetic fixture supports only its own loopback origin.'],
  EXPECTATION_FAILED: [417, 'Only the 100-continue expectation is supported.'],
  REQUEST_MALFORMED: [400, 'The request could not be parsed.'],
  HEADERS_TOO_LARGE: [431, 'The request headers are too large.'],
  REQUEST_TIMEOUT: [408, 'The request was not completed in time.'],
  INTERNAL_ERROR: [500, 'The fixture failed closed; nothing was changed.']
});

module.exports = Object.freeze({ CODES });
