(function () {
  'use strict';

  // The inspection page: real GET requests as a user of each of two tenants, and a verdict per probe that is DERIVED FROM THE FACTS it
  // observed (status, typed code, bytes compared with a control), never printed from server prose. An answer that does not validate against
  // the closed contract is shown as untrusted, never as allowed. The shared browser helper permits only GET, so this page never mutates.
  const contract = globalThis.C022Contract;
  const TOKEN = /^c022_[A-Za-z0-9_-]{43}$/;
  const ID = /^proj-\d{4,}$/;
  const NOWHERE = 'proj-9999';
  const NOWHERE_PROFILE = 'synthetic-999';
  const TIMEOUT_MS = 8000;
  const $ = (id) => document.getElementById(id);
  const ui = { a: $('token-a'), b: $('token-b'), run: $('run'), status: $('status'), rows: $('rows'), facts: $('facts') };
  let running = false;

  async function ask(token, path, headers) {
    const init = { method: 'GET', headers: { Authorization: `Bearer ${token}`, ...headers }, cache: 'no-store', credentials: 'omit' };
    if (typeof AbortSignal !== 'undefined') init.signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
      const response = await fetch(path, init);
      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      return { status: response.status, text, json, etag: response.headers.get('ETag') };
    } catch {
      return { status: 0, text: '', json: null, etag: null };
    }
  }

  // allowed: a 200 with outcome ok. refused: a status and a code that agree with the closed table of the contract. Anything else is untrusted.
  function classify(result) {
    const { status, json } = result;
    if (status === 304) return { kind: 'not-modified', code: null };
    if (status === 200 && json && json.outcome === 'ok') return { kind: 'allowed', code: 'ok' };
    const known = json && typeof json.outcome === 'string' && Object.hasOwn(contract.CODES, json.outcome);
    if (known && contract.CODES[json.outcome][0] === status && json.error && json.error.code === json.outcome) return { kind: 'refused', code: json.outcome };
    return { kind: 'untrusted', code: null };
  }

  function identityOf(result) {
    const session = classify(result).kind === 'allowed' ? result.json.session : null;
    if (!session || session.state !== 'active' || !contract.tenants.includes(session.tenant) || !contract.users.includes(session.user) || !contract.roles.includes(session.role)) return null;
    return { tenant: session.tenant, user: session.user, role: session.role };
  }

  function projectsOf(result) {
    const body = classify(result).kind === 'allowed' ? result.json : null;
    if (!body || !Array.isArray(body.items) || !Number.isInteger(body.count)) return null;
    if (!body.items.every((item) => item && ID.test(item.id) && typeof item.name === 'string')) return null;
    return body.items.map(({ id, name }) => ({ id, name }));
  }

  function profilesOf(result) {
    const body = classify(result).kind === 'allowed' ? result.json : null;
    if (!body || !Array.isArray(body.profiles)) return null;
    return body.profiles.every((entry) => entry && entry.profile && typeof entry.profile.id === 'string') ? body.profiles.map((entry) => entry.profile.id) : null;
  }

  const outcomeText = (result) => {
    const verdict = classify(result);
    return verdict.code === null || verdict.kind === 'allowed' ? verdict.kind : `${verdict.kind} ${verdict.code}`;
  };
  const refusedWith = (result, code) => { const verdict = classify(result); return verdict.kind === 'refused' && verdict.code === code; };
  const sameAnswer = (left, right) => left.status === right.status && left.text === right.text && left.text !== '';

  async function probeAll(tokens) {
    const rows = [];
    const add = (probe, who, result, ok, text) => {
      const tr = document.createElement('tr');
      const cells = [probe, who ? `${who.user} @ ${who.tenant}` : 'unknown', result ? String(result.status) : '-', result ? outcomeText(result) : '-', text];
      cells.forEach((value, index) => {
        const td = document.createElement('td');
        td.textContent = value;
        if (index === 4) td.className = ok ? 'ok' : 'bad';
        tr.appendChild(td);
      });
      ui.rows.appendChild(tr);
      rows.push(ok);
    };

    const callers = [];
    for (const token of tokens) {
      const whoResult = await ask(token, '/v1/session');
      const listResult = await ask(token, '/v1/projects?limit=10');
      const profileResult = await ask(token, '/v1/profiles');
      const caller = { token, who: identityOf(whoResult), items: projectsOf(listResult), profiles: profilesOf(profileResult) };
      callers.push(caller);
      add('who am I', caller.who, whoResult, caller.who !== null, caller.who ? 'an active session of a known tenant and role' : 'not a valid session answer');
      add('list my projects', caller.who, listResult, caller.items !== null, caller.items ? `${caller.items.length} project(s) listed` : 'not a valid list answer');
    }
    const [first, second] = callers;
    if (!first.who || !second.who || !first.items || !second.items) {
      add('cross probes', null, null, false, 'not run: an answer above was not valid');
    } else if (first.who.tenant === second.who.tenant) {
      add('cross probes', null, null, false, 'not run: both tokens belong to the same tenant');
    } else {
      for (const [caller, other] of [[first, second], [second, first]]) await crossProbes(caller, other, add);
    }

    const good = rows.filter(Boolean).length;
    const bad = rows.length - good;
    ui.facts.textContent = `Observed ${rows.length} checks: ${good} as specified, ${bad} not.`;
    ui.status.textContent = bad === 0 && callers.every((caller) => caller.who)
      ? `Isolation holds between ${first.who.tenant} and ${second.who.tenant}: ${good} of ${rows.length} checks as specified.`
      : `Not verified or NOT isolated: ${bad} of ${rows.length} checks failed.`;
  }

  async function crossProbes(caller, other, add) {
    const own = new Set(caller.items.map((item) => item.id));
    const theirs = new Set(other.items.map((item) => item.id));
    const foreignId = [...theirs].find((id) => !own.has(id));
    if (foreignId === undefined) {
      add('foreign project id', caller.who, null, true, 'n/a: every id of the other tenant also exists here (as a different object)');
    } else {
      const foreign = await ask(caller.token, `/v1/projects/${foreignId}`);
      const nowhere = await ask(caller.token, `/v1/projects/${NOWHERE}`);
      add('foreign project id', caller.who, foreign, refusedWith(foreign, 'RESOURCE_NOT_FOUND') && sameAnswer(foreign, nowhere), 'answered byte for byte like an id that exists nowhere');
      add('control: id that exists nowhere', caller.who, nowhere, refusedWith(nowhere, 'RESOURCE_NOT_FOUND'), 'the answer the foreign id must equal');
    }
    const ownId = caller.items[0] && caller.items[0].id;
    if (ownId !== undefined) {
      const read = await ask(caller.token, `/v1/projects/${ownId}`);
      add('own project', caller.who, read, classify(read).kind === 'allowed' && read.json.project && read.json.project.id === ownId && Boolean(read.etag), 'readable, with an ETag');
    }
    const header = await ask(caller.token, '/v1/projects', { 'X-Tenant': other.who.tenant });
    add('tenant claimed in a header', caller.who, header, header.status === 400 && refusedWith(header, 'TENANT_CLAIM_REJECTED'), 'refused as a claim');
    const query = await ask(caller.token, `/v1/projects?tenant=${other.who.tenant}`);
    add('tenant claimed in the query', caller.who, query, query.status === 400 && refusedWith(query, 'TENANT_CLAIM_REJECTED'), 'refused as a claim');
    const shared = caller.items.find((item) => theirs.has(item.id));
    if (shared !== undefined) {
      const theirRead = await ask(other.token, `/v1/projects/${shared.id}`);
      const crossed = await ask(caller.token, `/v1/projects/${shared.id}`, { 'If-None-Match': theirRead.etag || '"none"' });
      add('ETag of the other tenant', caller.who, crossed, crossed.status === 200 && classify(crossed).kind === 'allowed', 'validates nothing here (200, never 304)');
    }
    const word = other.items.length > 0 ? other.items[0].name.split('-')[0] : undefined;
    if (word !== undefined) {
      const search = await ask(caller.token, `/v1/projects?q=${word}`);
      const mine = caller.items.filter((item) => item.name.toLowerCase().includes(word)).length;
      add('search for the other tenant', caller.who, search, classify(search).kind === 'allowed' && search.json.count === mine, 'counts only my own matches');
    }
    const foreignProfile = (other.profiles || []).find((id) => !(caller.profiles || []).includes(id));
    if (foreignProfile === undefined) {
      add('foreign profile id', caller.who, null, true, 'n/a: the other tenant has no profile this tenant lacks');
    } else {
      const foreign = await ask(caller.token, `/v1/profiles/${foreignProfile}`);
      const nowhere = await ask(caller.token, `/v1/profiles/${NOWHERE_PROFILE}`);
      add('foreign profile id', caller.who, foreign, refusedWith(foreign, 'RESOURCE_NOT_FOUND') && sameAnswer(foreign, nowhere), 'answered byte for byte like a profile that exists nowhere');
    }
  }

  async function run() {
    if (running) return;
    const tokens = [ui.a.value.trim(), ui.b.value.trim()];
    if (!tokens.every((token) => TOKEN.test(token))) {
      ui.status.textContent = 'Paste a well-formed session token for each user (c022_ and 43 characters). Nothing was sent.';
      return;
    }
    running = true;
    ui.run.disabled = true;
    ui.rows.replaceChildren();
    ui.status.textContent = 'Running the probes...';
    try {
      await probeAll(tokens);
    } finally {
      running = false;
      ui.run.disabled = false;
    }
  }

  ui.run.addEventListener('click', run);
}());
