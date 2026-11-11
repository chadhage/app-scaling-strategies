(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const inputs = ['packet', 'owner', 'reservation-id', 'as-of'];
  let generation = 0, current = null;
  function invalidate(message) {
    generation += 1;
    current = null;
    byId('facts').replaceChildren();
    byId('acknowledge').checked = false;
    byId('acknowledge').disabled = true;
    byId('review').disabled = false;
    byId('status').textContent = message;
  }
  for (const id of inputs) byId(id).addEventListener('input', () => invalidate('Inputs changed. Review cleared; no execution authority.'));
  byId('scenario').addEventListener('change', () => invalidate('Selection changed. Load or review explicit facts; no execution authority.'));
  byId('load').addEventListener('click', () => {
    invalidate('Example loaded. Review the exact synthetic facts; no execution authority.');
    for (const id of inputs) byId(id).value = '';
    const selected = byId('scenario').value;
    const entry = Object.hasOwn(globalThis.C012Fixtures, selected) ? globalThis.C012Fixtures[selected] : null;
    if (!entry) return;
    const packet = JSON.parse(entry.text);
    byId('packet').value = entry.text;
    byId('owner').value = packet.subject;
    byId('reservation-id').value = packet.reservationId;
    byId('as-of').value = String(packet.observedAtMs);
  });
  byId('review').addEventListener('click', async () => {
    invalidate('Checking the supplied snapshot. No execution authority.');
    const started = generation;
    byId('review').disabled = true;
    const value = byId('as-of').value;
    const reviewed = await globalThis.C012Model.review(byId('packet').value, byId('owner').value, byId('reservation-id').value, value === '' ? NaN : Number(value));
    if (started !== generation) return;
    current = reviewed;
    for (const [key, label, value] of reviewed.rows) {
      const row = document.createElement('tr');
      row.setAttribute('data-fact', key);
      for (const text of [label, value]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      }
      byId('facts').appendChild(row);
    }
    byId('acknowledge').disabled = !reviewed.reviewable;
    byId('review').disabled = false;
    byId('status').textContent = reviewed.reviewable
      ? 'Local pre-run explanation ready. Reserved, estimated, assumptions and remaining allowance shown. No permission to run.'
      : `Review blocked: ${reviewed.reasons.join(', ')}. No permission to run.`;
  });
  byId('acknowledge').addEventListener('change', () => {
    const reviewed = Boolean(current && current.reviewable && byId('acknowledge').checked);
    byId('acknowledge').checked = reviewed;
    byId('status').textContent = reviewed ? 'Local facts marked reviewed only. This is not server consent or permission to run.' : 'No local acknowledgement. No permission to run.';
  });
  byId('reset').addEventListener('click', () => {
    invalidate('Reset. No current explanation or acknowledgement; no permission to run.');
    for (const id of inputs) byId(id).value = '';
    byId('packet').focus();
  });
}());
