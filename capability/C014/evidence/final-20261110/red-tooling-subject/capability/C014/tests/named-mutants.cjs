'use strict';

// Test tooling, not production code: the NAMED guard mutants. Each entry removes or weakens one guard of the redaction, the export path or the refusal path;
// `find` is an exact, unique piece of the pristine source. mutants.cjs --named runs them and records which test names failed.
// Together with the systematic generator in mutants.cjs they answer the card order: drop a field rule, skip nested arrays, skip keys, skip errors, skip the
// export path, remove value masking, each must fail a NAMED test.
const NAMED = [
  { id: 'R1 unknown fields are copied (the allow-list is dropped)', file: 'redact.cjs', find: 'const out = Object.fromEntries(Object.entries(node.fields).map(([field, child]) => [field, walk(child, read(value, field), state)]));',
    replace: 'const out = { ...value, ...Object.fromEntries(Object.entries(node.fields).map(([field, child]) => [field, walk(child, read(value, field), state)])) };' },
  { id: 'R2 nested arrays are not walked (entries pass raw)', file: 'redact.cjs', find: 'const entry = walk(node.of, read(value, index), state);', replace: 'const entry = read(value, index);' },
  { id: 'R3 value masking is removed from free text', file: 'redact.cjs', find: 'const masked = maskText(value);', replace: 'const masked = value;' },
  { id: 'R4 the encoded-forms check is removed', file: 'redact.cjs', find: 'if (canon.encodedIn(input, registry)) return MASK;', replace: '' },
  { id: 'R5 exact occurrences are not replaced', file: 'redact.cjs', find: 'let value = canon.replaceVerbatim(input, ordered, MASK);', replace: 'let value = input;' },
  { id: 'R6 the secret shapes are not replaced', file: 'redact.cjs', find: 'for (const [, shape] of PATTERNS) value = value.replace(shape, MASK);', replace: '' },
  { id: 'R7 an item with an invalid required field is published half formed', file: 'redact.cjs', find: 'if (node.required.some((field) => out[field] === null)) { state.redactions += 1; return null; }', replace: '' },
  { id: 'R8 a new secret does not change the epoch (stale published items)', file: 'redact.cjs', find: 'epoch += 1;', replace: '' },
  { id: 'R9 anyone can mint a PublicBody', file: 'redact.cjs', find: "if (brand !== BRAND) throw new TypeError('A PublicBody is made by publish() only');", replace: '' },
  { id: 'C1 double URL encoding is not decoded twice', file: 'canon.cjs', find: 'percentDecode(percentDecode(text))', replace: 'percentDecode(text)' },
  { id: 'C2 base64 alignment is ignored', file: 'canon.cjs', find: 'text = text.slice([0, 2, 3][prefix]);', replace: 'text = text.slice(0);' },
  { id: 'C3 format characters are not stripped by fold', file: 'canon.cjs', find: ".replace(/[\\p{Cf}\\p{Mn}\\p{Me}]/gu, '')", replace: '' },
  { id: 'E1 errors and their causes are skipped', file: 'evidence.cjs', find: ', ...(raw.error === undefined ? [] : errorSteps(raw.error))', replace: '' },
  { id: 'E2 the export is signed over the wrong text', file: 'evidence.cjs', find: 'value: sign(JSON.stringify(unsigned))', replace: "value: sign('')" },
  { id: 'E3 the rings are not bounded', file: 'evidence.cjs', find: 'if (stores[kind].length > RING) stores[kind].splice(0, stores[kind].length - RING);', replace: '' },
  { id: 'E4 published items are never published again', file: 'evidence.cjs', find: 'if (slot.epoch !== epoch) {', replace: 'if (slot.epoch === -1) {' },
  { id: 'V1 the bundle is signed with another key', file: 'vault.cjs', find: "createHmac('sha256', config.signingKey)", replace: "createHmac('sha256', 'x')" },
  { id: 'V2 the host of the connection string is not registered', file: 'vault.cjs', find: 'connection.server, connection.host, connection.database,', replace: 'connection.server, connection.database,' },
  { id: 'S1 an issued token is not registered by value', file: 'service.cjs', find: 'redactor.register(token);', replace: '' },
  { id: 'S2 a failing log sink fails the request', file: 'service.cjs', find: "try { logSink(JSON.stringify(redactor.publish('logs', { ...log, seq }))); } catch { /* a failing sink never fails a request */ }", replace: "logSink(JSON.stringify(redactor.publish('logs', { ...log, seq })));" },
  { id: 'W1 no checkExpectation listener (Node answers 417 itself)', file: 'server.cjs', find: "server.on('checkExpectation', (request, response) => admit(request, response, (_request, answer) => handle(request, answer, (out) => out.fail('EXPECTATION_FAILED'))));", replace: '' },
  { id: 'W2 no clientError listener', file: 'server.cjs', find: "server.on('clientError', (error, socket) => admit.refuse(socket, clientErrorCode(error)));", replace: '' },
  { id: 'W3 no connect listener', file: 'server.cjs', find: "server.on('connect', (request, socket) => admit.refuse(socket, 'METHOD_NOT_ALLOWED'));", replace: '' },
  { id: 'W4 no lanes: requests run as they arrive', file: 'server.cjs', find: 'requireHostHeader: false }, (request, response) => admit(request, response, route)', replace: 'requireHostHeader: false }, (request, response) => route(request, response)' },
  { id: 'W5 JSON may be sent that is not a PublicBody', file: 'server.cjs', find: "if (!isPublicBody(body)) throw new TypeError('Only a PublicBody may be sent as JSON');", replace: '' },
  { id: 'W6 Node answers a request without Host itself', file: 'server.cjs', find: 'requireHostHeader: false }, (request', replace: 'requireHostHeader: true }, (request' },
  { id: 'W7 no connection cap', file: 'server.cjs', find: 'server.maxConnections = bounds.connections;', replace: '' },
  { id: 'W8 no checkContinue listener', file: 'server.cjs', find: "server.on('checkContinue', (request, response) => admit(request, response, route));", replace: '' },
  // the guards that the third review named (F1, F3, H08, H12, R02, R15, R29) and the plus-for-space view of the F2 fix
  { id: 'X1 the shape of a management token is deleted (the blob shape also masks a token: only the granularity differs)', file: 'redact.cjs', find: "['management token', /c009_[A-Za-z0-9_-]{43}/g],", replace: '' },
  { id: 'X2 the local part of an e-mail address is capped at two characters', file: 'redact.cjs', find: '[A-Za-z0-9._%+-]{1,64}@', replace: '[A-Za-z0-9._%+-]{1,2}@' },
  { id: 'X3 a hex run needs 320 characters instead of 32', file: 'redact.cjs', find: '\\b[0-9a-fA-F]{32,}\\b', replace: '\\b[0-9a-fA-F]{320,}\\b' },
  { id: 'X4 the array limit is removed (decided by counted reads, never by a hang)', file: 'redact.cjs', find: 'const size = Math.min(value.length, node.max);', replace: 'const size = value.length;' },
  { id: 'X5 inherited fields are read (the own-property check is removed)', file: 'redact.cjs', find: 'try { return Object.hasOwn(holder, key) ? holder[key] : undefined; } catch { return undefined; }', replace: 'try { return holder[key]; } catch { return undefined; }' },
  { id: 'X6 the plus-for-space view is removed (a name written as Name+Part)', file: 'canon.cjs', find: ", percentDecode(text.replace(/\\+/g, ' '))]", replace: ']' },
  { id: 'X7 a contact name of five characters is accepted again', file: 'vault.cjs', find: "const NAME = /^[A-Za-z][A-Za-z '-]{5,60}$/;", replace: "const NAME = /^[A-Za-z][A-Za-z '-]{4,60}$/;" },
  { id: 'X8 /page.js is served from another file', file: 'server.cjs', find: "'/page.js': ['page.js', 'text/javascript; charset=utf-8']", replace: "'/page.js': ['service.cjs', 'text/javascript; charset=utf-8']" },
  { id: 'X9 a command request is recorded without its role', file: 'server.cjs', find: 'try { ctx.role = authenticate(service.registry, request.rawHeaders)?.role ?? null; } catch { ctx.role = null; }', replace: '' }
];

module.exports = Object.freeze({ NAMED });
