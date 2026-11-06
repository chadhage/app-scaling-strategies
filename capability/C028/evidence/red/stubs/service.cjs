'use strict';

// RED subject: the fictional schema is data only; there are no handlers.
const WatchRequest = { name: 'WatchRequest', fields: [
  { no: 1, name: 'topic', type: 'string' }, { no: 2, name: 'count', type: 'uint32' },
  { no: 3, name: 'interval_ms', type: 'uint32' }, { no: 4, name: 'payload_bytes', type: 'uint32' }] };
const Tick = { name: 'Tick', fields: [
  { no: 1, name: 'topic', type: 'string' }, { no: 2, name: 'seq', type: 'uint64' }, { no: 3, name: 'body', type: 'string' }] };
const Note = { name: 'Note', fields: [{ no: 1, name: 'text', type: 'string' }] };
const Echo = { name: 'Echo', fields: [
  { no: 1, name: 'text', type: 'string' }, { no: 2, name: 'seq', type: 'uint64' }, { no: 3, name: 'received', type: 'uint32' }] };
const SCHEMAS = { WatchRequest, Tick, Note, Echo };
const METHODS = {
  Watch: { path: '/acme.ticker.v1.Ticker/Watch', kind: 'server-streaming', request: WatchRequest, response: Tick },
  Chat: { path: '/acme.ticker.v1.Ticker/Chat', kind: 'bidirectional', request: Note, response: Echo }
};
module.exports = Object.freeze({ PACKAGE: 'acme.ticker.v1', SERVICE_NAME: 'acme.ticker.v1.Ticker', SCHEMAS, METHODS, createService: () => ({}) });
