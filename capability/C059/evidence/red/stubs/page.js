(function () {
  'use strict';

  // A NAIVE page (the RED subject): it works, but it is not accessible. Unnamed icon buttons, the focus dropped after every
  // action, an unvalidated form and a status that says success whatever the outcome was.
  const $ = (id) => document.getElementById(id);
  $('step-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = JSON.stringify({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: $('key').value, leaseId: $('lease').value, units: Number($('units').value) });
    const response = await fetch('/v1/steps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const envelope = await response.json();
    $('result').setAttribute('data-outcome', envelope.outcome);
    $('status').textContent = '\u2714 Success!';
    $('recovery').replaceChildren(...envelope.recovery.allowed.map(() => document.createElement('button')));
    document.activeElement.blur();
  });
}());
