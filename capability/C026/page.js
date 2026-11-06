(function () {
  'use strict';

  const DIRECTIONS = Object.freeze({
    open: 'connect',
    send: 'client sends',
    recv: 'server sends',
    abort: 'client destroys the socket, no close frame',
    'close-send': 'client sends a close frame',
    'close-recv': 'server sends a close frame'
  });
  const REQUIRED_FAILURES = Object.freeze([
    'ACK_OUT_OF_ORDER', 'ACK_UNSENT', 'CLIENT_SEQUENCE_FORBIDDEN', 'CURSOR_FOREIGN_SESSION', 'CURSOR_FROM_FUTURE'
  ]);
  const CURSOR = /^c1\.([A-Za-z0-9-]+)\.(0|[1-9][0-9]*)$/;
  const element = (id) => document.getElementById(id);

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function rejected(code, message, at) {
    return { verified: false, code, message, at: at ?? null };
  }

  // Checks the transcript itself; the server's word is never taken for the verdict.
  function verify(transcript) {
    if (!isRecord(transcript) || !Array.isArray(transcript.events) || transcript.events.length === 0) {
      return rejected('TRANSCRIPT_MALFORMED', 'The transcript has no events.');
    }
    const sessions = new Map();
    const redeliveredOn = new Map();
    const found = { aborts: 0, resumes: 0, firstDeliveries: 0, redeliveries: 0, acknowledgements: 0, completes: 0, failures: new Set() };
    let expected = 1;
    for (const event of transcript.events) {
      if (!isRecord(event) || event.n !== expected || typeof event.conn !== 'string' || !Object.hasOwn(DIRECTIONS, event.dir)) {
        return rejected('EVENT_MALFORMED', 'An event is missing, out of order or unknown.', expected);
      }
      expected += 1;
      if (event.dir === 'abort') found.aborts += 1;
      if (event.dir !== 'recv') continue;
      const frame = event.frame;
      if (!isRecord(frame) || typeof frame.type !== 'string') return rejected('FRAME_MALFORMED', 'A received frame is not a typed object.', event.n);
      const session = sessions.get(frame.session);
      if (frame.type === 'welcome') {
        if (session) return rejected('WELCOME_DUPLICATE', 'A session was welcomed twice; a second welcome would reset what was verified so far.', event.n);
        sessions.set(frame.session, { delivered: 0, acked: 0 });
      } else if (frame.type === 'resumed') {
        if (!session || frame.ackedThrough !== session.acked || frame.lastSent !== session.delivered) {
          return rejected('RESUME_POSITION_MISMATCH', 'A resume does not match the acknowledged and delivered positions seen so far.', event.n);
        }
        found.resumes += 1;
      } else if (frame.type === 'message') {
        if (!session || !Number.isSafeInteger(frame.seq)) return rejected('MESSAGE_SESSION_UNKNOWN', 'A message names no known session.', event.n);
        if (frame.redelivered === false) {
          if (frame.seq !== session.delivered + 1 || frame.deliveries !== 1) {
            return rejected('SEQUENCE_GAP_OR_DUPLICATE', 'A first delivery is not exactly the next sequence.', event.n);
          }
          session.delivered = frame.seq;
          found.firstDeliveries += 1;
        } else {
          const floor = Math.max(session.acked, redeliveredOn.get(event.conn) ?? 0);
          if (frame.redelivered !== true || frame.seq <= floor || frame.seq > session.delivered || !(frame.deliveries >= 2)) {
            return rejected('REDELIVERY_INVALID', 'A redelivery repeats an acknowledged or already redelivered message.', event.n);
          }
          redeliveredOn.set(event.conn, frame.seq);
          found.redeliveries += 1;
        }
      } else if (frame.type === 'acked') {
        const cursor = typeof frame.cursor === 'string' ? CURSOR.exec(frame.cursor) : null;
        const owner = cursor ? sessions.get(cursor[1]) : undefined;
        if (!owner || Number(cursor[2]) !== frame.seq) return rejected('ACK_CURSOR_INVALID', 'An acknowledgement has no matching cursor.', event.n);
        if (frame.seq > owner.delivered) return rejected('ACK_FOR_UNSENT', 'A message that was never sent was acknowledged.', event.n);
        if (frame.seq !== owner.acked + 1) return rejected('ACK_OUT_OF_ORDER', 'An acknowledgement skipped or repeated a sequence.', event.n);
        owner.acked = frame.seq;
        found.acknowledgements += 1;
      } else if (frame.type === 'complete') {
        if (!session || frame.through !== session.acked || frame.through !== session.delivered) {
          return rejected('COMPLETE_BEFORE_ALL_ACKNOWLEDGED', 'A stream completed before every message was acknowledged.', event.n);
        }
        found.completes += 1;
      } else if (frame.type === 'error') {
        found.failures.add(frame.code);
      } else {
        return rejected('FRAME_TYPE_UNKNOWN', `Unknown frame type ${frame.type}.`, event.n);
      }
    }
    const missing = [
      ...(found.aborts > 0 ? [] : ['abrupt disconnect']), ...(found.resumes > 0 ? [] : ['resume']),
      ...(found.redeliveries > 0 ? [] : ['redelivery']), ...(found.completes > 0 ? [] : ['completion']),
      ...REQUIRED_FAILURES.filter((code) => !found.failures.has(code))
    ];
    if (missing.length > 0) return rejected('EXPECTED_EVIDENCE_MISSING', `The transcript lacks: ${missing.join(', ')}.`);
    return {
      verified: true, sessions: sessions.size, events: transcript.events.length, firstDeliveries: found.firstDeliveries,
      redeliveries: found.redeliveries, acknowledgements: found.acknowledgements, resumes: found.resumes,
      aborts: found.aborts, completes: found.completes, typedFailures: [...found.failures].sort()
    };
  }

  function describe(event) {
    if (event.frame !== undefined) return JSON.stringify(event.frame);
    return event.code === undefined ? '' : `${event.code} ${event.reason ?? ''}`.trim();
  }

  function row(event) {
    const line = document.createElement('tr');
    line.className = `dir-${event.dir}`;
    for (const [name, text] of [['', String(event.n)], ['', event.conn], ['', DIRECTIONS[event.dir]], ['frame', describe(event)]]) {
      const cell = document.createElement('td');
      cell.className = name;
      cell.textContent = text;
      line.appendChild(cell);
    }
    return line;
  }

  function clear(message) {
    element('events').replaceChildren();
    element('summary').textContent = 'No verified transcript.';
    element('status').textContent = message;
  }

  function show(transcript, verdict) {
    if (!verdict.verified) {
      clear(`REJECTED — ${verdict.code}: ${verdict.message}${verdict.at === null ? '' : ` (event ${verdict.at})`}`);
      return;
    }
    element('events').replaceChildren(...transcript.events.map(row));
    element('summary').textContent = JSON.stringify(verdict, null, 2);
    element('status').textContent = `VERIFIED LOCAL TRANSCRIPT — ${verdict.sessions} sessions, ${verdict.firstDeliveries} first deliveries, `
      + `${verdict.redeliveries} redeliveries, ${verdict.typedFailures.length} typed failures. The browser observed this transcript, not a WebSocket.`;
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
    show(transcript, verify(transcript));
  }

  Object.defineProperty(globalThis, 'C026Transcript', { value: Object.freeze({ verify, REQUIRED_FAILURES }) });
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
