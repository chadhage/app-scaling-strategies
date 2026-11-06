(function () {
  'use strict';

  // The page only asks and shows. It learns the ids of every conductor by listing AS that conductor, then asks for every one of them as
  // every identity, and derives each outcome from the HTTP status, the typed code and the shape of the answer, never from server prose.
  const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
  const ROLES = { visitor: 'visitor', 'conductor-a': 'conductor', 'conductor-b': 'conductor', operator: 'operator' };
  const FOLDERS = { run: 'runs', scratch: 'scratches', export: 'exports' };
  const ID_SHAPE = /^(lease|run|scratch|export)-[0-9a-f]{8,32}$/;
  const CODES = ['TARGET_NOT_FOUND', 'ROLE_FORBIDDEN', 'AUTHENTICATION_REQUIRED', 'TOKEN_MALFORMED', 'TOKEN_UNKNOWN', 'TOKEN_EXPIRED', 'NOT_FOUND'];
  const ABSENT = { run: 'run-ffffffffffffffff' };
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
  const codeOf = (answer) => (answer.reached && isObject(answer.body) && isObject(answer.body.error) && CODES.includes(answer.body.error.code) && answer.body.outcome === answer.body.error.code ? answer.body.error.code : null);
  const shown = (answer) => (answer.reached ? String(answer.status) : DASH);

  // The outcome of one row: what the status, the code and the shape of the answer prove, compared with what the row expects.
  function judge(expect, answer, context) {
    if (!answer.reached) return 'no answer';
    const code = codeOf(answer);
    if (expect.kind === 'allowed') {
      const ok = answer.status === 200 && isObject(answer.body) && answer.body.outcome === 'ok' && expect.check(answer.body);
      return ok ? 'allowed' : 'violation';
    }
    if (expect.kind === 'foreign') {
      // A foreign target must look exactly like an absent one: the same status, the same typed code and the same bytes.
      return answer.status === 404 && code === 'TARGET_NOT_FOUND' && answer.text === context.absent ? 'forbidden' : 'violation';
    }
    return answer.status === expect.status && code === expect.code ? 'forbidden' : 'violation';
  }

  const validLease = (item) => isObject(item) && ID_SHAPE.test(item.id) && item.id.startsWith('lease-');
  async function learn(token) {
    const own = { lease: null, run: null, scratch: null, export: null };
    const leases = await ask(token, '/v1/leases');
    if (!leases.reached || leases.status !== 200 || !isObject(leases.body) || !Array.isArray(leases.body.items) || !leases.body.items.every(validLease)) return own;
    if (leases.body.items.length === 0) return own;
    own.lease = leases.body.items[0].id;
    for (const kind of Object.keys(FOLDERS)) {
      const list = await ask(token, '/v1/leases/' + own.lease + '/' + FOLDERS[kind]);
      const items = list.reached && list.status === 200 && isObject(list.body) && Array.isArray(list.body.items) ? list.body.items : [];
      if (items.length > 0 && isObject(items[0]) && typeof items[0].id === 'string' && items[0].id.startsWith(kind + '-') && ID_SHAPE.test(items[0].id)) own[kind] = items[0].id;
    }
    return own;
  }

  const targets = (ids) => [
    ['read lease', 'lease', '/v1/leases/' + ids.lease, (body) => isObject(body.lease) && body.lease.id === ids.lease],
    ['list runs', 'runs', '/v1/leases/' + ids.lease + '/runs', (body) => Array.isArray(body.items) && body.items.every((item) => ID_SHAPE.test(item.id))],
    ['read run', 'run', '/v1/leases/' + ids.lease + '/runs/' + ids.run, (body) => isObject(body.resource) && body.resource.id === ids.run],
    ['read scratch', 'scratch', '/v1/leases/' + ids.lease + '/scratches/' + ids.scratch, (body) => isObject(body.resource) && body.resource.id === ids.scratch],
    ['read export', 'export', '/v1/leases/' + ids.lease + '/exports/' + ids.export, (body) => isObject(body.resource) && body.resource.id === ids.export]
  ];

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
    for (const identity of ['conductor-a', 'conductor-b']) {
      for (const [action, label, route, check] of targets(owned[identity])) rows.push({ identity, action, target: 'own ' + label, token: tokens[identity], route, expect: { kind: 'allowed', check } });
    }
    for (const [attacker, victim] of [['conductor-a', 'conductor-b'], ['conductor-b', 'conductor-a']]) {
      for (const [action, label, route] of targets(owned[victim])) rows.push({ identity: attacker, action, target: 'foreign ' + label, token: tokens[attacker], route, expect: { kind: 'foreign' } });
    }
    for (const identity of ['visitor', 'operator']) {
      for (const [action, label, route] of targets(owned['conductor-a']).slice(0, 2)) rows.push({ identity, action, target: 'conductor-a ' + label, token: tokens[identity], route, expect: { kind: 'role', status: 403, code: 'ROLE_FORBIDDEN' } });
    }
    const leaseRoute = targets(owned['conductor-a'])[0][2];
    rows.push({ identity: 'anonymous', action: 'read lease', target: 'conductor-a lease', token: '', route: leaseRoute, expect: { kind: 'role', status: 401, code: 'AUTHENTICATION_REQUIRED' } });
    const everyId = Object.values(owned).flatMap((ids) => Object.values(ids)).filter((id) => typeof id === 'string' && id.startsWith('lease-') === false);
    rows.push({ identity: 'operator', action: 'read lease metadata', target: 'operator route', token: tokens.operator, route: '/v1/operator/leases', expect: { kind: 'allowed', check: (body) => Array.isArray(body.items) && !JSON.stringify(body).split('"').some((piece) => everyId.includes(piece)) } });
    return rows;
  }

  async function inspect() {
    byId('status').textContent = 'Inspecting\u2026';
    const tokens = {};
    for (const identity of IDENTITIES) tokens[identity] = byId('token-' + identity).value.trim();
    const owned = {};
    for (const identity of ['conductor-a', 'conductor-b']) owned[identity] = await learn(tokens[identity]);
    const missing = ['conductor-a', 'conductor-b'].filter((identity) => Object.values(owned[identity]).includes(null));
    if (missing.length > 0) {
      byId('rows').replaceChildren();
      byId('status').textContent = 'Nothing to inspect: no complete lease with a run, a scratch resource and an export was listed for ' + missing.join(' and ') + '. Nothing is shown as allowed.';
      return;
    }
    const control = await ask(tokens['conductor-b'], '/v1/leases/' + owned['conductor-a'].lease + '/runs/' + ABSENT.run);
    const context = { absent: control.reached && control.status === 404 && codeOf(control) === 'TARGET_NOT_FOUND' ? control.text : null };
    const rows = [];
    let violations = 0;
    for (const item of plan(tokens, owned)) {
      const answer = await ask(item.token, item.route);
      const outcome = judge(item.expect, answer, context);
      if (outcome === 'violation' || outcome === 'no answer') violations += 1;
      rows.push(row([item.identity, item.action, item.target, shown(answer), codeOf(answer) || (answer.reached && answer.status === 200 ? 'ok' : DASH), outcome], outcome));
    }
    byId('rows').replaceChildren(...rows);
    byId('status').textContent = violations === 0
      ? 'Checked ' + rows.length + ' rows: every owner reached its own resources and no foreign resource was reachable by anyone else.'
      : 'Checked ' + rows.length + ' rows: ' + violations + ' violation(s). Do not trust this server.';
  }

  byId('run').addEventListener('click', inspect);
}());
