'use strict';

const { STATUS_CODES } = require('node:http');
const { CODES } = require('./codes.cjs');

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-C009-Scope': 'synthetic-loopback-only'
});
// THE REFUSAL PATH, for importers (C010, C014 and C022 import this file read-only). Three rules, each proven by tests of this card:
// 1. Every error answer is final. A refusal announces Connection: close, marks the SOCKET of the REQUEST (response.req.socket; never
//    response.socket, which is null while a response waits behind an unfinished pipelined one) in the very tick that decides it, and stops
//    reading from it. An unread body is parsed byte by byte (a 1-byte chunk costs one JS callback) and libuv reads up to 2 MB per loop
//    turn, so a refusal that waited for its own flush let one client block a server for seconds. Node ends the connection once the answer
//    is flushed. Send EVERY error through createResponder (status >= 400); a refusal decided elsewhere calls endConnection(socket).
// 2. Nothing runs behind a refusal. Node parses every pipelined request of one TCP read and emits each request event before the first
//    response has finished, so a request pipelined behind a refusal is dispatched before the refusal exists. createLanes() runs the
//    requests of one connection ONE AT A TIME, in order (request N+1 starts after the response of request N has finished) and drops
//    what is queued on, or arrives on, a marked socket; requests before the refusal are still answered. Route EVERY entry point through
//    it (request and checkExpectation) and test isFinished(request.socket) after every await and right before an effect.
// 3. Stopping reads is socket._handle.readStop(), a Node INTERNAL (a public pause() leaves Node free to restart reading). Absent, a refusal
//    would silently degrade to Connection: close alone and the stall of review F1 would return: canStopReading() must be checked on the
//    first connection and at startup (server.cjs does), and endConnection destroys a socket that cannot be stopped (fail closed).
// 4. Node answers some requests ITSELF and never calls the handler (rev-C017): an unknown Expect (checkExpectation), a request without
//    Host (set requireHostHeader: false and let localGuard answer), a parse error, an oversized header or a timeout (clientError) and
//    CONNECT. Install a listener for each and route it through the same path: admit() for a request, admit.refuse(socket, code) for the
//    rest (a typed answer written on the socket, the socket marked, no longer read, ended after the flush; behind the answers of the
//    requests before it). Never rely on server.maxRequestsPerSocket for ordering: it is not applied to HTTP/1.0 and not advanced by
//    Node's own 400; the mark and the lanes do not depend on the HTTP version.
const finished = new WeakSet();
const isFinished = (socket) => finished.has(socket);
const canStopReading = (owner) => typeof owner?._handle?.readStop === 'function';
const markFinished = (socket) => { if (socket) finished.add(socket); };

function stopReading(socket) {
  if (!socket || socket.destroyed) return;
  if (canStopReading(socket)) socket._handle.readStop(); else socket.destroy();
}

function endConnection(socket) {
  markFinished(socket);
  stopReading(socket);
}

// A typed answer written straight on the socket for a refusal that Node decided itself, then the same ending as a refused request: the
// socket is marked, no longer read, ended, and destroyed once the answer and the end are flushed (Node detaches CONNECT sockets from its
// idle timeout, so nothing else would ever close one that nobody reads).
function refuseSocket(socket, code) {
  endConnection(socket);
  if (socket.destroyed || !socket.writable) {
    socket.destroy();
    return;
  }
  const [status, message] = CODES[code];
  const body = Buffer.from(JSON.stringify({ outcome: code, error: { code, message } }));
  const headers = { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, Connection: 'close' };
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\r\n');
  socket.once('finish', () => socket.destroy());
  socket.end(Buffer.concat([Buffer.from(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\n${lines}\r\n\r\n`), body]));
}

const CLIENT_ERRORS = Object.freeze({
  HPE_HEADER_OVERFLOW: 'HEADERS_TOO_LARGE', ERR_HTTP_REQUEST_TIMEOUT: 'REQUEST_TIMEOUT', HPE_CHUNK_EXTENSIONS_OVERFLOW: 'BODY_TOO_LARGE'
});
const clientErrorCode = (error) => (Object.hasOwn(CLIENT_ERRORS, error?.code) ? CLIENT_ERRORS[error.code] : 'REQUEST_MALFORMED');
const wantsContinue = (request) => request.httpVersion === '1.1' && /(?:^|\W)100-continue(?:$|\W)/i.test(request.headers.expect || '');

function createResponder(response) {
  const send = (status, body, type, headers = {}) => {
    const socket = response.req.socket;
    const refusal = status >= 400;
    if (refusal) markFinished(socket);
    response.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': body.length, ...(refusal && { Connection: 'close' }), ...headers });
    response.end(body);
    if (refusal) stopReading(socket);
  };
  return {
    json: (status, value, headers) => send(status, Buffer.from(JSON.stringify(value)), 'application/json; charset=utf-8', headers),
    file: (buffer, type) => send(200, buffer, type),
    // An Expect: 100-continue is answered with 100 only when the request is about to be read: a refused one is never invited to send its body.
    proceed() { if (wantsContinue(response.req)) response.writeContinue(); },
    fail(code, body = {}, headers = {}) {
      const [status, message] = CODES[code];
      send(status, Buffer.from(JSON.stringify({ outcome: code, error: { code, message }, ...body })), 'application/json; charset=utf-8', headers);
    }
  };
}

// Only the exact listener is served: the Host must be this 127.0.0.1 port and a browser Origin, when sent, must be this origin.
// Returns the typed error code to answer with, or null.
function localGuard(request, server) {
  const host = `127.0.0.1:${server.address().port}`;
  if (request.socket.remoteAddress !== '127.0.0.1' || request.headers.host !== host) return 'LOCAL_HOST_REQUIRED';
  if (request.headers.origin !== undefined && request.headers.origin !== `http://${host}`) return 'CROSS_ORIGIN_DENIED';
  return null;
}

function hasBody(request) {
  return request.headers['transfer-encoding'] !== undefined || Number(request.headers['content-length'] || 0) > 0;
}

// The body is cut at the limit: nothing beyond it is read, the caller answers 413 and the connection ends with that answer.
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) resolve({ tooLarge: true });
      else chunks.push(chunk);
    });
    request.on('end', () => resolve({ buffer: Buffer.concat(chunks) }));
    request.on('error', reject);
  });
}

// The requests of one connection run one at a time, in arrival order (rule 2). admit(request, response, task) starts task(request, response)
// when every earlier request of that socket has finished its response; a task that throws or rejects destroys its response. More than
// `depth` requests running or waiting on one socket cut the connection off: one chunk can hold thousands of tiny requests and each would
// keep a response object alive. A destroyed or marked socket admits nothing and drops what it had queued.
// admit.refuse(socket, code) is the same ending for a refusal Node decided itself (rule 4). The request that Node was still receiving
// when it gave up (a stalled header or body, a malformed chunk: request.complete is false) is the one that failed: a queued one never
// runs and a running one is answered at once. Otherwise the refusal waits behind the requests that came before it (a parse error
// cannot be followed by a request: the parser stops).
function createLanes({ depth }) {
  const lanes = new WeakMap();
  const laneOf = (socket) => {
    let lane = lanes.get(socket);
    if (!lane) {
      lane = { waiting: [], busy: false, current: null };
      lanes.set(socket, lane);
    }
    return lane;
  };

  function pump(socket, lane) {
    if (lane.busy || lane.waiting.length === 0) return;
    if (socket.destroyed || finished.has(socket)) {
      lane.waiting.length = 0;
      return;
    }
    const { request, response, task } = lane.waiting.shift();
    if (!response) {
      task();
      return;
    }
    lane.busy = true;
    lane.current = request;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      lane.busy = false;
      lane.current = null;
      pump(socket, lane);
    };
    response.once('finish', release);
    response.once('close', release);
    const fail = () => response.destroy();
    try { Promise.resolve(task(request, response)).catch(fail); } catch { fail(); }
  }

  function admit(request, response, task) {
    const { socket } = request;
    if (socket.destroyed || finished.has(socket)) return;
    const lane = laneOf(socket);
    if (lane.waiting.length + (lane.busy ? 1 : 0) >= depth) {
      socket.destroy();
      return;
    }
    lane.waiting.push({ request, response, task });
    pump(socket, lane);
  }

  admit.refuse = (socket, code) => {
    if (socket.destroyed || finished.has(socket)) return;
    const lane = laneOf(socket);
    if (lane.waiting.at(-1)?.request?.complete === false) lane.waiting.pop();
    const stalled = lane.waiting.length === 0 && lane.current?.complete === false;
    if (stalled || (!lane.busy && lane.waiting.length === 0)) {
      refuseSocket(socket, code);
      return;
    }
    stopReading(socket);
    lane.waiting.push({ response: null, task: () => refuseSocket(socket, code) });
  };
  return admit;
}

module.exports = Object.freeze({
  SECURITY_HEADERS, canStopReading, clientErrorCode, createLanes, createResponder, endConnection, hasBody, isFinished, localGuard, readBody
});
