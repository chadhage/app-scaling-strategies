(function () {
  'use strict';

  const EVENTS = new Set(['request', 'request-message', 'headers', 'message', 'trailers', 'cancel', 'deadline', 'violation', 'end']);
  const REQUIRED_PROBES = Object.freeze(['http1-request', 'non-grpc-content-type', 'http2-get']);
  const element = (id) => document.getElementById(id);
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const rejected = (code, message, at) => ({ verified: false, code, message, at: at ?? null });

  // What each required call must prove. The page never takes the server's word: it re-checks every transcript itself.
  const EXPECTED = Object.freeze([
    ['watch-ok', (call) => call.result.ok === true && call.result.messageCount >= 3, 'an OK server stream of at least three messages'],
    ['chat-ok', (call) => call.result.ok === true && call.result.messageCount >= 3, 'an OK bidirectional call with at least three echoes'],
    ['watch-cancelled', (call) => call.result.status.code === 1 && call.result.status.origin === 'client-cancel', 'a client-cancelled stream'],
    ['watch-deadline', (call) => call.result.status.code === 4 && call.server.outcome === 'DEADLINE_EXCEEDED', 'a deadline-exceeded stream'],
    ['unknown-method', (call) => call.result.trailersOnly === true && call.result.status.code === 12, 'a Trailers-Only UNIMPLEMENTED answer'],
    ['invalid-argument', (call) => call.result.status.code === 3 && call.result.ok === false, 'an INVALID_ARGUMENT answer'],
    ['message-too-large', (call) => call.result.status.code === 8 && call.result.violations.some((item) => item.code === 'MESSAGE_TOO_LARGE'), 'an oversized message refused by the driver']
  ]);

  function verifyCall(call) {
    const id = isRecord(call) && typeof call.id === 'string' ? call.id : null;
    if (id === null || !isRecord(call.result) || !Array.isArray(call.result.violations) || !isRecord(call.server) || !Array.isArray(call.events) || call.events.length < 2) {
      return rejected('CALL_MALFORMED', 'A call lacks its id, result, server record or events.', id);
    }
    const { result, server, events } = call;
    const found = { messages: 0, trailers: null, cancel: false, violation: false, ended: false };
    let expected = 1;
    for (const event of events) {
      if (!isRecord(event) || event.n !== expected || !EVENTS.has(event.ev) || found.ended) {
        return rejected('EVENT_ORDER', 'An event is missing, unknown, out of order or after the end of the call.', id);
      }
      expected += 1;
      if (event.ev === 'message') {
        found.messages += 1;
        if (found.trailers !== null) return rejected('MESSAGE_AFTER_TRAILERS', 'A message arrived after the trailers.', id);
        if (event.index !== found.messages || !isRecord(event.message) || event.message.seq !== found.messages) {
          return rejected('MESSAGE_ORDER', 'Messages must arrive in order with server-owned sequence numbers 1, 2, 3 and so on.', id);
        }
      }
      if (event.ev === 'trailers') found.trailers = isRecord(event.trailers) ? event.trailers : {};
      if (event.ev === 'cancel') found.cancel = true;
      if (event.ev === 'violation') found.violation = true;
      if (event.ev === 'end') found.ended = true;
    }
    if (!found.ended || events[0].ev !== 'request') return rejected('EVENT_ORDER', 'A call starts with its request and finishes with exactly one end event.', id);
    const status = result.status;
    if (!isRecord(status) || !Number.isInteger(status.code) || typeof status.origin !== 'string') return rejected('STATUS_MISMATCH', 'The final status is missing or malformed.', id);
    if (result.messageCount !== found.messages) return rejected('MESSAGE_COUNT_MISMATCH', 'The reported message count differs from the messages in the events.', id);
    const sent = found.trailers === null ? null : Number(found.trailers['grpc-status']);
    const clean = status.origin === 'server-trailers' && status.code === 0 && !found.violation;
    if (result.ok !== clean) return rejected('OK_MISMATCH', 'ok must be true exactly when OK trailers ended a conversation without violations.', id);
    if (result.ok && sent !== 0) return rejected('OK_WITHOUT_TRAILERS', 'A call is reported ok without trailers that carry grpc-status 0.', id);
    if (status.origin === 'server-trailers' && sent !== status.code) return rejected('STATUS_MISMATCH', 'The final status differs from the grpc-status in the trailers.', id);
    if (result.trailersOnly === true && found.messages > 0) return rejected('TRAILERS_ONLY_WITH_MESSAGES', 'A Trailers-Only answer cannot carry messages.', id);
    if (found.cancel && (status.code !== 1 || server.outcome !== 'CANCELLED' || server.writesAfterFinish !== 0 || !(server.produced >= found.messages))) {
      return rejected('CANCEL_NOT_OBSERVED', 'A client cancel must be observed by the server, which then writes nothing more.', id);
    }
    if (status.origin === 'server-trailers' && status.code === 4 && server.outcome !== 'DEADLINE_EXCEEDED') {
      return rejected('DEADLINE_MISMATCH', 'DEADLINE_EXCEEDED trailers must match the server record of the call.', id);
    }
    return null;
  }

  function verify(transcript) {
    if (!isRecord(transcript) || !Array.isArray(transcript.calls) || !Array.isArray(transcript.probes) || transcript.calls.length === 0) {
      return rejected('TRANSCRIPT_MALFORMED', 'The transcript has no calls or probes.');
    }
    for (const call of transcript.calls) {
      const problem = verifyCall(call);
      if (problem !== null) return problem;
    }
    const byId = new Map(transcript.calls.map((call) => [call.id, call]));
    for (const [id, check, text] of EXPECTED) {
      if (!byId.has(id)) return rejected('EXPECTED_EVIDENCE_MISSING', `The transcript lacks the call ${id}.`, id);
      if (!check(byId.get(id))) return rejected('EXPECTED_EVIDENCE_MISSING', `The call ${id} does not prove ${text}.`, id);
    }
    const probes = new Map(transcript.probes.filter(isRecord).map((probe) => [probe.id, probe]));
    for (const id of REQUIRED_PROBES) {
      const probe = probes.get(id);
      if (!probe) return rejected('EXPECTED_EVIDENCE_MISSING', `The transcript lacks the probe ${id}.`, id);
      if (probe.refused !== true || probe.grpcStatusPresent === true) return rejected('PROBE_NOT_REFUSED', `The probe ${id} was not refused cleanly.`, id);
    }
    return {
      verified: true, calls: transcript.calls.length, messages: transcript.calls.reduce((sum, call) => sum + call.result.messageCount, 0),
      outcomes: transcript.calls.map((call) => `${call.id}: ${call.result.outcome} / ${call.result.status.name}`), probes: transcript.probes.length
    };
  }

  function cell(text, className) {
    const node = document.createElement('td');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function describe(event) {
    if (event.ev === 'request') return `${event.path} · grpc-timeout ${event.timeout === null ? 'none' : event.timeout}`;
    if (event.ev === 'headers') return `HTTP ${event.httpStatus} · ${event.contentType} · ends stream: ${event.endsStream}`;
    if (event.ev === 'message') return `${JSON.stringify(event.message)} · ${event.bytes} bytes behind a 5-byte prefix`;
    if (event.ev === 'trailers') return JSON.stringify(event.trailers);
    if (event.ev === 'violation') return `${event.code}: ${event.message}`;
    if (event.ev === 'end') return `${event.name} (${event.code}) from ${event.origin}`;
    return event.ev === 'request-message' ? `request message ${event.index} · ${event.bytes} bytes` : '';
  }

  function renderCall(call) {
    const section = document.createElement('section');
    section.className = `call outcome-${call.result.outcome}`;
    const title = document.createElement('h3');
    title.textContent = call.title;
    const verdict = document.createElement('p');
    verdict.textContent = `${call.result.outcome.toUpperCase()} — ${call.result.status.name} (${call.result.status.code}) from ${call.result.status.origin}; `
      + `server: ${call.server.outcome} via ${call.server.finishedBy}, produced ${call.server.produced}`;
    const table = document.createElement('table');
    const body = document.createElement('tbody');
    for (const event of call.events) {
      const row = document.createElement('tr');
      row.appendChild(cell(String(event.n), 'n'));
      row.appendChild(cell(event.ev, 'what'));
      row.appendChild(cell(describe(event), 'detail'));
      body.appendChild(row);
    }
    table.appendChild(body);
    section.appendChild(title);
    section.appendChild(verdict);
    section.appendChild(table);
    return section;
  }

  function renderProbe(probe) {
    const row = document.createElement('tr');
    row.appendChild(cell(probe.title, 'what'));
    row.appendChild(cell(probe.observed, 'detail'));
    row.appendChild(cell('refused', 'detail'));
    return row;
  }

  function clear(message) {
    element('calls').replaceChildren();
    element('probes').replaceChildren();
    element('summary').textContent = 'No verified transcript.';
    element('status').textContent = message;
  }

  function show(transcript, verdict) {
    if (!verdict.verified) {
      clear(`REJECTED — ${verdict.code}: ${verdict.message}${verdict.at === null ? '' : ` (${verdict.at})`}`);
      return;
    }
    element('calls').replaceChildren(...transcript.calls.map(renderCall));
    element('probes').replaceChildren(...transcript.probes.map(renderProbe));
    element('summary').textContent = JSON.stringify(verdict, null, 2);
    element('status').textContent = `VERIFIED LOCAL TRANSCRIPT — ${verdict.calls} calls, ${verdict.messages} messages, ${verdict.probes} refused probes. `
      + 'The browser observed this transcript, not native gRPC.';
  }

  async function load() {
    clear('Pending — fetching the server-produced transcript.');
    let transcript;
    try {
      const response = await fetch('/transcript.json', { method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error' });
      if (!response.ok) {
        clear(`REJECTED — HTTP_${response.status}: the server produced no transcript.`);
        return;
      }
      transcript = await response.json();
    } catch {
      clear('REJECTED — TRANSCRIPT_UNAVAILABLE: no valid JSON transcript was received.');
      return;
    }
    let verdict;
    try {
      verdict = verify(transcript);
    } catch {
      verdict = rejected('TRANSCRIPT_MALFORMED', 'The transcript could not be verified.');
    }
    show(transcript, verdict);
  }

  Object.defineProperty(globalThis, 'C028Transcript', { value: Object.freeze({ verify, EXPECTED, REQUIRED_PROBES }) });
  element('load').addEventListener('click', async () => {
    const button = element('load');
    if (button.disabled) return;
    button.disabled = true;
    try {
      await load();
    } finally {
      button.disabled = false;
    }
  });
  element('load').disabled = false;
}());
