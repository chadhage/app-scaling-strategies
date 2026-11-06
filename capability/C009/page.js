(function () {
  'use strict';

  // The page only asks and shows: every decision on screen is the server's answer, never a guess made here.
  const COMMANDS = ['run.create', 'scratch.create', 'pool.resize', 'experiment.approve', 'native.execute'];
  const SAMPLES = {
    'run.create': { name: 'alpha', units: 5 },
    'scratch.create': { name: 'scratch-a' },
    'pool.resize': { size: 3 },
    'experiment.approve': { experimentId: 'exp-001' }
  };
  const DASH = '\u2014';
  const byId = (id) => document.getElementById(id);

  function requestHeaders(withBody) {
    const headers = {};
    const token = byId('token').value.trim();
    if (token !== '') headers.Authorization = 'Bearer ' + token;
    if (byId('claim').value !== '') headers['X-Role'] = byId('claim').value;
    if (withBody) headers['Content-Type'] = 'application/json';
    return headers;
  }

  // reached is false when the browser blocked the request or the server could not be reached: then there is no decision at all.
  async function ask(url, init) {
    try {
      const response = await fetch(url, init);
      let body = null;
      try { body = await response.json(); } catch { body = null; }
      return { reached: true, status: response.status, body };
    } catch {
      return { reached: false };
    }
  }

  function describe(answer) {
    if (!answer.reached) return ['not sent', DASH, 'NO_SERVER_ANSWER', DASH];
    const { status, body } = answer;
    const preview = body && body.preview;
    if (status === 200 && preview && typeof preview.allowed === 'boolean' && preview.allowed === (preview.status === 200)) {
      return [preview.allowed ? 'allowed' : 'denied', String(preview.status), String(preview.code), String(preview.role)];
    }
    if (status === 401 && body && body.error) return ['refused', '401', String(body.error.code), DASH];
    return ['no decision', DASH, body && body.error ? String(body.error.code) : 'MALFORMED_ANSWER', DASH];
  }

  function row(cells) {
    const tr = document.createElement('tr');
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    return tr;
  }

  function summary(answers, described) {
    if (described.every((cells) => cells[0] === 'allowed' || cells[0] === 'denied')) {
      const { subject, role } = answers[0].body.preview;
      return 'Server decisions for ' + subject + ' (' + role + ').';
    }
    const refused = described.find((cells) => cells[0] === 'refused');
    if (refused) return 'Server refused the credential: ' + refused[2] + '. Nothing is shown as allowed.';
    return 'No server decision: the request was not sent or got no answer. Nothing is shown as allowed.';
  }

  async function showRevision() {
    const answer = await ask('/v1/state', { headers: {} });
    if (answer.reached && answer.status === 200 && answer.body && Number.isInteger(answer.body.revision)) {
      byId('revision').textContent = String(answer.body.revision);
    }
  }

  byId('check').addEventListener('click', async () => {
    byId('status').textContent = 'Checking\u2026';
    const answers = [];
    for (const command of COMMANDS) {
      answers.push(await ask('/v1/authorization/preview?command=' + encodeURIComponent(command), { headers: requestHeaders(false) }));
    }
    const described = answers.map(describe);
    byId('rows').replaceChildren(...COMMANDS.map((command, index) => row([command, ...described[index]])));
    byId('status').textContent = summary(answers, described);
    await showRevision();
  });

  byId('send').addEventListener('click', async () => {
    const command = byId('command').value;
    const sample = Object.hasOwn(SAMPLES, command) ? SAMPLES[command] : {};
    const answer = await ask('/v1/commands/' + encodeURIComponent(command), { method: 'POST', headers: requestHeaders(true), body: JSON.stringify(sample) });
    if (!answer.reached) {
      byId('sent').textContent = 'Not sent: no server decision. The read-only browser blocked it or the server is unreachable.';
    } else {
      const outcome = answer.body && answer.body.outcome ? String(answer.body.outcome) : 'MALFORMED_ANSWER';
      const applied = answer.status === 200 && answer.body && Number.isInteger(answer.body.revision);
      byId('sent').textContent = 'HTTP ' + answer.status + ' ' + outcome + (applied ? ': applied, server revision ' + answer.body.revision + '.' : '.');
    }
    await showRevision();
  });

  showRevision();
}());
