'use strict';
// Naive RED subject, retained and never edited: it never asks the server. It believes the claimed-role selector,
// marks every command allowed for a claimed operator and reports a send as applied without any request.
(function () {
  const byId = (id) => document.getElementById(id);
  const commands = ['run.create', 'scratch.create', 'pool.resize', 'experiment.approve', 'native.execute'];
  byId('check').addEventListener('click', () => {
    const operator = byId('claim').value === 'operator';
    byId('status').textContent = operator ? 'Everything is allowed.' : 'Nothing is allowed.';
    byId('rows').replaceChildren(...commands.map((name) => {
      const row = document.createElement('tr');
      for (const text of [name, operator ? 'allowed' : 'denied', operator ? '200' : '403', operator ? 'ok' : 'ROLE_FORBIDDEN', byId('claim').value || 'visitor']) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      }
      return row;
    }));
  });
  byId('send').addEventListener('click', () => { byId('sent').textContent = 'Applied.'; });
})();
