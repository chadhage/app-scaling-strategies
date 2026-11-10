'use strict';

// Test tooling: the guard mutants of server.cjs (C059 review F3 and the pipelining addition). [file, from, to, label, suites, equivalent-reason?]
// `suites` names the test files that must fail BY NAME; mutants-page.cjs and mutants-checker.cjs use the suites of their own group.
const S = 'server.cjs';
const SERVER = ['server', 'pipelining', 'lane'];
const RESOURCES = ['resources', 'flood', 'pipelining', 'lane-flood', 'pending'];
const m = (from, to, label, suites = SERVER, equivalent) => ({ file: S, from, to, label, suites, equivalent });

module.exports = [
  m("|| request.headers.host !== host", '', 'the Host check'),
  m("if (request.headers.origin && request.headers.origin !== origin) return refuse('CROSS_ORIGIN_DENIED');", '', 'the Origin check'),
  m("request.url.length > 2048", 'false', 'the URL length limit'),
  m("|| url.hash) return refuse('INVALID_URL')", ") return refuse('INVALID_URL')", 'the fragment refusal'),
  m("if (url.search) { refuse('INVALID_QUERY'); return false; }", '', 'the query refusal'),
  m("if (method === 'GET' && hasBody) { refuse('UNEXPECTED_BODY'); return false; }", '', 'the unexpected body on GET'),
  m("if (request.method !== method) { refuse('METHOD_NOT_ALLOWED', {}, { Allow: method }); return false; }", '', 'the method check'),
  m("if (contract.KEY_PATTERN.test(value)) return true;", 'return true;', 'the key format check'),
  m("if (!JSON_TYPE.test(request.headers['content-type'] ?? '')) return refuse('UNSUPPORTED_MEDIA_TYPE', { action: 'submit' });", '', 'the media type check'),
  m("if (Number(request.headers['content-length'] || 0) > contract.LIMITS.bodyBytes) return refuse('BODY_TOO_LARGE', { action: 'submit' });", '', 'the declared body size check'),
  m("...(refusing ? { Connection: 'close' } : {})", '', 'Connection: close after a refusal'),
  m("    response.once('finish', () => request.socket.destroy());", '', 'ONLY the socket destroy after the flush (mutant S5 of the third review)', RESOURCES, "DEMONSTRATED (tests\\node-close.test.cjs): every refusal answer carries `Connection: close` (writeAnswer adds it whenever the status is 400 or above; the strict rows of tests\\lane.test.cjs and the server and pipelining suites assert the header on every refusal), and Node itself then ends the connection after the flush (`res._last`, then `socket.destroySoon()` when the response finishes), which tests\\node-close.test.cjs SHOWS on the running platform in the shapes that matter (one refused request, three pipelined, a stream of further requests, a refused request whose chunked body never ends, HTTP/1.0) with a bare server that has no destroy anywhere, against a control without the header that answers both pipelined requests and keeps the connection; the survival of this mutant in the lane, pipelining, flood and resource suites is the same fact observed on the service itself"),
  m("() => request.socket.destroy()", '() => response.socket.destroy()', 'response.socket instead of request.socket in the destroy after the flush'),
  m("  closing.add(socket);\n  const lane = lanes.get(socket);", "  const lane = lanes.get(socket);", 'the mark of the connection inside decide()'),
  m("  if (lane) lane.queue.length = 0;", '', 'dropping the waiting requests inside decide()'),
  m("    decide(request.socket);\n", '', 'deciding at all when a refusal is written'),
  m("    if (closing.has(socket)) return;", '', 'the check at the top of the request handler'),
  m("    lane.queue.push({ request, response, kind });\n    if (!lane.running) drain(lane);", "    handle(request, response);", 'the lane: every pipelined request runs at once'),
  m("    lane.queue.push({ request, response, kind });", "    lane.queue.push({ request, response, kind: KIND.ordinary });", 'a lane entry forgets what it was: the 417 and the 100-continue entries become ordinary requests (review N1)'),
  m("const admit = (request, response, kind = KIND.ordinary) => {", "const admit = (request, response, kind = KIND.expectation) => {", 'an ordinary request is admitted as an unsupported expectation (review N1)'),
  m("    next.response.once('close', () => drain(lane));", '', 'the next pipelined request never starts'),
  m("const refusing = status >= 400;", "const refusing = status >= 500;", 'an engine rejection (409) is not a refusal'),
  m("  server.on('checkExpectation', (request, response) => admit(request, response, KIND.expectation));", '', "Node's own 417 for another expectation keeps the connection"),
  m("  server.on('checkExpectation', (request, response) => admit(request, response, KIND.expectation));", "  server.on('checkExpectation', (request, response) => writeAnswer(request, response, 417, EXPECTATION_REFUSED));", "Node's own 417 is decided at parse time, outside the lane: it drops the requests BEFORE it (review N1)"),
  m("    if (next.kind === KIND.expectation) { writeAnswer(next.request, next.response, 417, EXPECTATION_REFUSED); return; }\n", '', 'the lane starts the 417 entry like an ordinary request (review N1)'),
  m("    if (next.kind === KIND.expectation) {", "    if (next.kind === KIND.continue) {", 'the lane answers 417 for a 100-continue entry and never for an unsupported expectation (review N1)'),
  m("if (lane.queue.length >= limits.pipelineDepth) {", 'if (false) {', 'the bound on waiting pipelined requests', RESOURCES),
  m("if (size > limit) {", 'if (false) {', 'the streaming body limit', RESOURCES),
  m("server.maxConnections = limits.connections;", '', 'the connection cap', RESOURCES),
  m("const timer = setTimeout(() => socket.destroy(), limits.firstRequestMs);", 'const timer = setTimeout(() => {}, limits.firstRequestMs);', 'the first-request timeout', RESOURCES),
  m("http.createServer({ maxHeaderSize: limits.headerBytes, connectionsCheckingInterval: limits.checkMs, requireHostHeader: false }", 'http.createServer({ maxHeaderSize: limits.headerBytes, requireHostHeader: false }', 'connectionsCheckingInterval (the effective timeout bound)', RESOURCES),
  // The answers Node would give by itself (orders\_PIPELINING.md, the two holes found by rev-C017): each listener and option has its mutant.
  m(", requireHostHeader: false }", " }", 'requireHostHeader: Node answers a request without Host with its own 400 and never calls the handler'),
  m("  server.on('checkContinue', (request, response) => admit(request, response, KIND.continue));", '', 'checkContinue: Node sends 100 Continue itself, also for a request that never runs', SERVER, "REASONING ONLY: without the listener Node writes the interim 100 Continue itself when the response is assigned the socket (a queued response buffers it, a dropped one never sends it) and then calls the same listener: the lane already starts the requests one at a time, so no client can tell the two orders apart in the shapes the independent reviewer tried (three shapes, the same wire order); the listener only makes the moment explicit. No runnable demonstration is committed"),
  m("  server.on('clientError', refuseMalformed);", '', "clientError: Node's default bare 400 for a request it cannot parse"),
  m("  decide(socket);\n  if (!socket.writable || socket.destroyed) { socket.destroy(); return; }", "  if (!socket.writable || socket.destroyed) { socket.destroy(); return; }", 'decide() on a parse error: a request that waits behind the one in flight still starts and applies its effect (review D1: a queued cancel ended a step of another connection)', ['victim']),
  m("Object.hasOwn(NODE_REFUSALS, error.code) ? NODE_REFUSALS[error.code] : MALFORMED_REQUEST", "MALFORMED_REQUEST", 'the typed 431 and 408 of the parse errors (every one is a plain 400)', RESOURCES),
  m("    if (next.kind === KIND.continue) next.response.writeContinue();", '', 'the 100 Continue of a request when it starts'),
  m("    clearTimeout(silent.get(socket));\n", '', 'the first-request timer is not cleared by a request', RESOURCES),
  m("for (const socket of sockets.get(server) ?? []) socket.destroy();", '', 'closeServer destroying every tracked socket', RESOURCES, 'REASONING ONLY: server.closeAllConnections() on the next line destroys the same sockets (every accepted socket has a parser in Node\'s connection list); the explicit loop only keeps shutdown independent of that API. No runnable demonstration is committed'),
  m("|| RESERVED.test(dataName) || dataName.endsWith('.')", '', 'the Windows device-name guard'),
  // The third review (Q1, Q2): the refused request ITSELF must not run, and the cap bounds the pending first requests.
  m("connections: 32, headerBytes: 8192", "connections: 128, headerBytes: 8192", 'the connection cap is 128 again: 128 x about 6 MB of pending first requests is about 0.77 GB (review Q2)', RESOURCES),
  m("writeAnswer(next.request, next.response, 417, EXPECTATION_REFUSED); return; }", "writeAnswer(next.request, next.response, 417, EXPECTATION_REFUSED); }", 'S1: drain() goes on to run the handler for the request it has just refused with the 417 (the return is deleted; mutant S1 of the third review, killed by the valid step bodies of the refused requests)'),
  // The fourth review (D1): what waits behind a refusal decided by Node's parser must be dropped, for every kind of parse error (tests\victim.test.cjs).
  m("  decide(socket);\n  if (!socket.writable || socket.destroyed) { socket.destroy(); return; }", "  closing.add(socket);\n  if (!socket.writable || socket.destroyed) { socket.destroy(); return; }", 'refuseMalformed marks the connection but does not drop what waits behind it (review D1: the queued request still runs after the parse error)', ['victim']),
  // The binding of every recorded exchange to the request it answers (review Q7): transcript.cjs.
  { file: 'transcript.cjs', from: "    if (!event.request || typeof event.request.path !== 'string') return fail('EVENT_SHAPE', `Event ${event.n} has no recorded request.`);\n", to: '', label: 'transcript: an exchange without its recorded request is not refused (review Q7)', suites: ['transcript'] },
  { file: 'transcript.cjs', from: 'journey.present(answer, journey.expectedFor(event.request))', to: 'journey.present(answer, { key: answer.body.idempotencyKey, input: null })', label: 'transcript: an answer is not bound to the request it was recorded for (review Q7)', suites: ['transcript'] },
];
