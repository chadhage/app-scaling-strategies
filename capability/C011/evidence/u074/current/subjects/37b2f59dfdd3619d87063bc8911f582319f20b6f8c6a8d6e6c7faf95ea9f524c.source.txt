(function () {
  'use strict';

  // The page only asks and shows. It learns the reservations of every conductor by listing AS that conductor, then asks for every one of them as
  // every identity, and derives each outcome from the HTTP status, the typed code and the shape and the numbers of the answer, never from server
  // prose. The books are re-derived from what the operator reports and what each conductor reports about its own share: pool = reserved + free,
  // and the shares agree.
  const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
  const CONDUCTORS = ['conductor-a', 'conductor-b'];
  const ROLES = { visitor: 'visitor', 'conductor-a': 'conductor', 'conductor-b': 'conductor', operator: 'operator' };
  const ID_SHAPE = /^rsv-[0-9a-f]{8,32}$/;
  const STATES = ['reserved', 'released', 'expired'];
  const TIERS = ['standard', 'burst'];
  const CODES = ['RESERVATION_NOT_FOUND', 'ROLE_FORBIDDEN', 'AUTHENTICATION_REQUIRED', 'TOKEN_MALFORMED', 'TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'NOT_FOUND'];
  const ABSENT = 'rsv-ffffffffffffffff';
  const DASH = '\u2014';
  const byId = (id) => document.getElementById(id);

  async function ask(token, route) {
    const headers = token === '' ? {} : { Authorization: 'Bearer ' + token };
    try {
      const response = await fetch(route, { headers });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch { body = null; }
      return { reached: true, status: response.status, body, text };
    } catch {
      return { reached: false };
    }
  }

  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const count = (value) => Number.isSafeInteger(value) && value >= 0;
  const figure = (value) => (count(value) ? String(value) : DASH);
  const codeOf = (answer) => (answer.reached && isObject(answer.body) && isObject(answer.body.error) && CODES.includes(answer.body.error.code) && answer.body.outcome === answer.body.error.code ? answer.body.error.code : null);
  const shown = (answer) => (answer.reached ? String(answer.status) : DASH);
  const validReservation = (item, prices) => isObject(item) && typeof item.id === 'string' && ID_SHAPE.test(item.id) && TIERS.includes(item.tier) && count(item.units) && item.units >= 1
    && count(item.spend) && (prices === null || item.spend === item.units * prices[item.tier]) && STATES.includes(item.state);
  const validAllowance = (body) => isObject(body.allowance) && isObject(body.allowance.pool) && Object.keys(body.allowance.pool).join() === 'units,spend' && count(body.allowance.pool.units) && count(body.allowance.pool.spend)
    && isObject(body.allowance.lease) && ['capUnits', 'capSpend', 'heldUnits', 'heldSpend', 'remainingUnits', 'remainingSpend'].every((name) => count(body.allowance.lease[name]))
    && body.allowance.lease.remainingUnits === body.allowance.lease.capUnits - body.allowance.lease.heldUnits && body.allowance.lease.remainingSpend === body.allowance.lease.capSpend - body.allowance.lease.heldSpend
    && ['replayKeys', 'maxReplayKeys', 'remainingReplayKeys'].every((name) => count(body.allowance.lease[name]))
    && body.allowance.lease.maxReplayKeys >= 1 && body.allowance.lease.maxReplayKeys <= 2000
    && body.allowance.lease.remainingReplayKeys === body.allowance.lease.maxReplayKeys - body.allowance.lease.replayKeys
    && isObject(body.allowance.prices) && TIERS.every((tier) => count(body.allowance.prices[tier])) && !/free|reserved/i.test(JSON.stringify(body));

  // What the operator reports: the pool balances, there is one entry per conductor, and every conductor's own report of its share is the operator's figure.
  function balanced(body, shares) {
    const { pool, leases } = isObject(body) ? body : {};
    if (!isObject(pool) || !Array.isArray(leases) || leases.length !== CONDUCTORS.length) return false;
    const names = ['units', 'spend', 'reservedUnits', 'reservedSpend', 'freeUnits', 'freeSpend'];
    if (!names.every((name) => count(pool[name])) || pool.units !== pool.reservedUnits + pool.freeUnits || pool.spend !== pool.reservedSpend + pool.freeSpend) return false;
    let units = 0;
    let spend = 0;
    for (const [at, name] of CONDUCTORS.entries()) {
      const lease = leases[at];
      if (!isObject(lease) || lease.subject !== name || !count(lease.heldUnits) || !count(lease.heldSpend) || !isObject(shares[name])) return false;
      if (lease.heldUnits !== shares[name].heldUnits || lease.heldSpend !== shares[name].heldSpend || lease.heldUnits > lease.capUnits || lease.heldSpend > lease.capSpend) return false;
      units += lease.heldUnits;
      spend += lease.heldSpend;
    }
    return units === pool.reservedUnits && spend === pool.reservedSpend;
  }

  // The outcome of one row: what the status, the code and the shape of the answer prove, compared with what the row expects.
  function judge(expect, answer, context) {
    if (!answer.reached) return 'no answer';
    const code = codeOf(answer);
    if (expect.kind === 'allowed') return answer.status === 200 && isObject(answer.body) && answer.body.outcome === 'ok' && expect.check(answer.body) ? 'allowed' : 'violation';
    if (expect.kind === 'foreign') {
      // A foreign reservation must look exactly like an absent one: the same status, the same typed code and the same bytes.
      return answer.status === 404 && code === 'RESERVATION_NOT_FOUND' && answer.text === context.absent ? 'forbidden' : 'violation';
    }
    return answer.status === expect.status && code === expect.code ? 'forbidden' : 'violation';
  }

  async function learn(token) {
    const own = { id: null, prices: null, share: null };
    const allowance = await ask(token, '/v1/allowance');
    if (allowance.reached && allowance.status === 200 && isObject(allowance.body) && validAllowance(allowance.body)) {
      own.prices = allowance.body.allowance.prices;
      own.share = allowance.body.allowance.lease;
    }
    const list = await ask(token, '/v1/reservations?limit=50');
    const items = list.reached && list.status === 200 && isObject(list.body) && Array.isArray(list.body.items) ? list.body.items : [];
    const consistent = isObject(list.body) && count(list.body.total) && list.body.total >= items.length
      && own.share !== null && own.share.replayKeys >= list.body.total
      && new Set(items.map((item) => item?.id)).size === items.length;
    if (own.prices !== null && consistent && items.length > 0 && items.every((item) => validReservation(item, own.prices))) own.id = items[0].id;
    return own;
  }

  function row(cells, outcome) {
    const tr = document.createElement('tr');
    cells.forEach((text, index) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (index === cells.length - 1) td.setAttribute('data-outcome', outcome);
      tr.appendChild(td);
    });
    return tr;
  }

  function plan(tokens, owned) {
    const rows = [];
    for (const identity of IDENTITIES) {
      rows.push({ identity, action: 'who am I', target: 'itself', token: tokens[identity], route: '/v1/me', expect: { kind: 'allowed', check: (body) => body.subject === identity && body.role === ROLES[identity] } });
    }
    for (const identity of CONDUCTORS) {
      const own = owned[identity];
      rows.push({ identity, action: 'read allowance', target: 'own caps', token: tokens[identity], route: '/v1/allowance', expect: { kind: 'allowed', check: (body) => validAllowance(body) } });
      rows.push({ identity, action: 'list reservations', target: 'own list', token: tokens[identity], route: '/v1/reservations?limit=50',
        expect: { kind: 'allowed', check: (body) => Array.isArray(body.items) && body.items.length > 0 && count(body.total) && body.total >= body.items.length && body.items.every((item) => validReservation(item, own.prices)) } });
      rows.push({ identity, action: 'read reservation', target: 'own reservation', token: tokens[identity], route: '/v1/reservations/' + own.id, expect: { kind: 'allowed', check: (body) => isObject(body.reservation) && body.reservation.id === own.id && validReservation(body.reservation, own.prices) } });
    }
    for (const [attacker, victim] of [['conductor-a', 'conductor-b'], ['conductor-b', 'conductor-a']]) {
      rows.push({ identity: attacker, action: 'read reservation', target: 'foreign reservation', token: tokens[attacker], route: '/v1/reservations/' + owned[victim].id, expect: { kind: 'foreign' } });
    }
    for (const identity of ['visitor', 'operator']) {
      for (const [action, route] of [['read allowance', '/v1/allowance'], ['list reservations', '/v1/reservations']]) rows.push({ identity, action, target: 'conductor routes', token: tokens[identity], route, expect: { kind: 'role', status: 403, code: 'ROLE_FORBIDDEN' } });
    }
    for (const identity of CONDUCTORS) rows.push({ identity, action: 'read pool books', target: 'operator route', token: tokens[identity], route: '/v1/operator/pool', expect: { kind: 'role', status: 403, code: 'ROLE_FORBIDDEN' } });
    rows.push({ identity: 'anonymous', action: 'read allowance', target: 'conductor routes', token: '', route: '/v1/allowance', expect: { kind: 'role', status: 401, code: 'AUTHENTICATION_REQUIRED' } });
    const shares = { 'conductor-a': owned['conductor-a'].share, 'conductor-b': owned['conductor-b'].share };
    rows.push({ identity: 'operator', action: 'read pool books', target: 'operator route', token: tokens.operator, route: '/v1/operator/pool', expect: { kind: 'allowed', check: (body) => balanced(body, shares) } });
    rows.push({ identity: 'operator', action: 'read audit', target: 'operator route', token: tokens.operator, route: '/v1/operator/audit', expect: { kind: 'allowed', check: (body) => Array.isArray(body.items) } });
    return rows;
  }

  function showBooks(answer, shares) {
    const body = answer !== null && answer.reached && answer.status === 200 && isObject(answer.body) ? answer.body : {};
    const pool = isObject(body.pool) ? body.pool : {};
    const leases = Array.isArray(body.leases) ? body.leases : [];
    const held = (at, name) => (isObject(leases[at]) ? leases[at][name] : undefined);
    const cells = { 'pool-units': pool.units, 'pool-spend': pool.spend, 'reserved-units': pool.reservedUnits, 'reserved-spend': pool.reservedSpend, 'free-units': pool.freeUnits, 'free-spend': pool.freeSpend,
      'a-units': held(0, 'heldUnits'), 'a-spend': held(0, 'heldSpend'), 'b-units': held(1, 'heldUnits'), 'b-spend': held(1, 'heldSpend') };
    for (const [name, value] of Object.entries(cells)) byId('books-' + name).textContent = figure(value);
    const fine = balanced(body, shares);
    byId('books-balanced').textContent = fine ? 'yes: the pool is reserved plus free, and each conductor reports the share the operator shows' : 'no: do not trust these figures';
    byId('books-balanced').setAttribute('data-balanced', fine ? 'yes' : 'no');
  }

  async function inspect() {
    byId('status').textContent = 'Inspecting\u2026';
    const tokens = {};
    for (const identity of IDENTITIES) tokens[identity] = byId('token-' + identity).value.trim();
    const owned = {};
    for (const identity of CONDUCTORS) owned[identity] = await learn(tokens[identity]);
    const missing = CONDUCTORS.filter((identity) => owned[identity].id === null);
    if (missing.length > 0) {
      byId('rows').replaceChildren();
      byId('status').textContent = 'Nothing to inspect: no reservation was listed for ' + missing.join(' and ') + '. Nothing is shown as allowed.';
      return;
    }
    const control = await ask(tokens['conductor-b'], '/v1/reservations/' + ABSENT);
    const context = { absent: control.reached && control.status === 404 && codeOf(control) === 'RESERVATION_NOT_FOUND' ? control.text : null };
    const rows = [];
    let violations = 0;
    let books = null;
    for (const item of plan(tokens, owned)) {
      const answer = await ask(item.token, item.route);
      if (item.route === '/v1/operator/pool' && item.identity === 'operator') books = answer;
      const outcome = judge(item.expect, answer, context);
      if (outcome === 'violation' || outcome === 'no answer') violations += 1;
      rows.push(row([item.identity, item.action, item.target, shown(answer), codeOf(answer) || (answer.reached && answer.status === 200 ? 'ok' : DASH), outcome], outcome));
    }
    showBooks(books, { 'conductor-a': owned['conductor-a'].share, 'conductor-b': owned['conductor-b'].share });
    byId('rows').replaceChildren(...rows);
    const replaySummary = CONDUCTORS.map((name) => {
      const lease = owned[name].share;
      return name + ' ' + lease.replayKeys + '/' + lease.maxReplayKeys + ' (' + lease.remainingReplayKeys + ' remaining)';
    }).join('; ');
    byId('status').textContent = violations === 0
      ? 'Checked ' + rows.length + ' rows: every conductor reached its own reservations, the books balance and agree with what each conductor reports, and no foreign reservation was reachable by anyone else. Replay keys: ' + replaySummary + '.'
      : 'Checked ' + rows.length + ' rows: ' + violations + ' violation(s). Do not trust this server.';
  }

  byId('run').addEventListener('click', inspect);
}());
