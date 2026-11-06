(function () {
  'use strict';

  // Scrubbing page. It only reads the saved recordings (saved.js) through the pure model: no fetch, XHR, EventSource, WebSocket, timer or
  // producer is used, every recorded string is clipped and shown with textContent, and a position that was not recorded is refused.
  const T = globalThis.X001Timeline;
  const D = globalThis.X001Describe;
  const runs = globalThis.X001Saved.runs;
  const ids = runs.map((run) => run.id);
  const $ = (id) => document.getElementById(id);
  const KEYS = Object.freeze({ ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 });
  const view = { timeline: null, runId: null, index: -1 };

  const say = (text) => { $('status').textContent = text; };
  const fail = (text) => { $('error').textContent = text; };
  const node = (tag, text, className = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    element.className = className;
    return element;
  };
  const jumpButtons = () => T.JUMPS.flatMap((kind) => [`prev-${kind}`, `next-${kind}`]);

  function unload() {
    Object.assign(view, { timeline: null, runId: null, index: -1 });
    for (const id of ['entries', 'state', 'limits']) $(id).replaceChildren();
    $('status').dataset.state = 'UNLOADED';
    $('provenance').textContent = '';
    $('verified').textContent = 'Nothing is verified yet.';
    $('producing').textContent = 'No position is shown.';
    $('producing').dataset.mark = 'none';
    $('position').textContent = 'Position: none';
    Object.assign($('position').dataset, { position: '0', of: '0' });
    const slider = $('scrub');
    for (const [name, value] of [['aria-valuemin', '0'], ['aria-valuemax', '0'], ['aria-valuenow', '0'], ['aria-valuetext', 'No saved run is loaded'],
      ['aria-disabled', 'true'], ['tabindex', '-1']]) slider.setAttribute(name, value);
    $('scrub-fill').style.width = '0%';
    $('seq-result').textContent = '';
    for (const id of ['prev', 'next', 'seq-find', 'seq-epoch', 'seq-number', ...jumpButtons()]) $(id).disabled = true;
  }

  function listEntries(built) {
    const failed = new Set(built.hits.failure);
    const unknown = new Set(built.hits.unknown);
    $('entries').replaceChildren(...built.marks.map((mark, index) => {
      const item = document.createElement('li');
      item.id = `entry-${index + 1}`;
      item.dataset.class = failed.has(index) ? 'failed' : unknown.has(index) ? 'unknown' : 'ok';
      item.append(node('span', D.label(mark), 'mark'), node('span', D.entryText(built.entries[index])), node('span', '', 'here'),
        node('span', D.notes(built.stateAt(index).flags), 'note'));
      return item;
    }));
  }

  function render(answer) {
    const text = D.announce(answer);
    const slider = $('scrub');
    for (const [name, value] of [['aria-valuemin', '1'], ['aria-valuemax', String(answer.of)], ['aria-valuenow', String(answer.position)],
      ['aria-valuetext', text], ['aria-disabled', 'false'], ['tabindex', '0']]) slider.setAttribute(name, value);
    $('scrub-fill').style.width = `${(answer.index * 100) / Math.max(1, answer.of - 1)}%`;
    $('position').textContent = `Position ${answer.position} of ${answer.of}`;
    Object.assign($('position').dataset, { position: String(answer.position), of: String(answer.of) });
    $('producing').textContent = `Producing entry: ${D.label(answer.mark)}. ${D.entryText(answer.entry)}`;
    $('producing').dataset.mark = answer.mark;
    $('state').replaceChildren(...D.stateLines(answer).flatMap((line) => {
      const value = node('dd', line.value);
      value.id = line.id;
      return [node('dt', line.label), value];
    }));
    [...$('entries').children].forEach((item, index) => {
      const here = index === answer.index;
      item.className = here ? 'current' : '';
      if (here) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
      item.children[2].textContent = here ? 'current position' : '';
    });
    $('prev').disabled = answer.index === 0;
    $('next').disabled = answer.index === answer.of - 1;
    for (const id of ['seq-find', 'seq-epoch', 'seq-number']) $(id).disabled = false;
    for (const kind of T.JUMPS) {
      $(`prev-${kind}`).disabled = T.jump(view.timeline, answer.index, kind, -1) === null;
      $(`next-${kind}`).disabled = T.jump(view.timeline, answer.index, kind, 1) === null;
    }
    $('status').dataset.state = 'SHOWN';
    say(text);
  }

  const outside = (position, length) => `NOT_RECORDED: the requested position ${position} is outside this recording (positions 1 to ${length}). `
    + 'The position did not change; Home and End go to the first and the last position.';

  function moveTo(index) {
    const answer = view.timeline.stateAt(index);
    if (!answer.ok) {
      fail(outside(index + 1, view.timeline.length));
      return false;
    }
    view.index = index;
    fail('');
    render(answer);
    history.replaceState(null, '', T.formatFragment(view.runId, answer.position));
    return true;
  }

  // A built timeline is immutable, so each saved run is built and verified once per page session.
  const prepared = new Map();
  function prepare(id) {
    if (!prepared.has(id)) {
      const entry = runs.find((run) => run.id === id);
      const built = T.build(entry);
      prepared.set(id, { built, check: built.ok ? T.verify(entry, built) : null });
    }
    return prepared.get(id);
  }

  function loadRun(id, position) {
    const { built, check } = prepare(id);
    if (!built.ok) {
      $('saved-run').value = id;
      unload();
      history.replaceState(null, '', T.formatFragment(id, position));
      fail(`REFUSED ${built.code}${built.detail ? ` (${D.clip(built.detail)})` : ''}: this saved run is not shown as a timeline.`);
      say('This saved run was refused. No timeline is shown and nothing is assumed to have succeeded.');
      return false;
    }
    if (!built.stateAt(position - 1).ok) {
      fail(outside(position, built.length));
      return false;
    }
    $('saved-run').value = id;
    Object.assign(view, { timeline: built, runId: id });
    $('verified').textContent = check.ok
      ? `Verified: ${check.checked} of ${built.length} positions recomputed from the recorded entries match the displayed states.`
      : `VERIFICATION FAILED at ${check.mismatches.length} positions: do not trust this display.`;
    const source = built.source || {};
    const word = (value) => (typeof value === 'string' ? D.clip(value) : 'unknown');
    $('provenance').textContent = `${built.title} Source: ${word(source.producer)} ${word(source.accepted)}${source.hostile ? ' (FICTIONAL HOSTILE SET)' : ''}.`;
    $('limits').replaceChildren(...D.limitLines(built.limits).map((line) => node('li', line)));
    listEntries(built);
    return moveTo(position - 1);
  }

  // The address always names what is displayed: a refused fragment is replaced by the displayed position and its text is never kept.
  const restoreFragment = () => {
    if (view.timeline) history.replaceState(null, '', T.formatFragment(view.runId, view.index + 1));
  };

  function applyFragment(text) {
    const parsed = T.parseFragment(text, ids);
    if (!parsed.ok) {
      if (parsed.code !== 'FRAGMENT_EMPTY') fail(`${parsed.code}: the address fragment was refused and nothing from it is shown; the display is unchanged.`);
      restoreFragment();
      return false;
    }
    const done = view.timeline && view.runId === parsed.run ? moveTo(parsed.pos - 1) : loadRun(parsed.run, parsed.pos);
    if (!done) restoreFragment();
    return done;
  }

  function onKey(event) {
    // Browser and assistive-technology shortcuts (Alt+Left is "back", Ctrl+Home scrolls) are never taken over.
    if (!view.timeline || event.altKey || event.ctrlKey || event.metaKey) return;
    let target;
    if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = view.timeline.length - 1;
    else if (Object.hasOwn(KEYS, event.key)) target = view.index + KEYS[event.key];
    else return;
    event.preventDefault();
    moveTo(target);
  }

  // A sequence number of the run is looked up, never approximated: a recorded one moves there, any other is a typed NOT_RECORDED.
  const WHOLE = /^[1-9][0-9]{0,5}$/;
  function findSequence() {
    const epoch = $('seq-epoch').value.trim();
    const sequence = $('seq-number').value.trim();
    const result = $('seq-result');
    if (!WHOLE.test(epoch) || !WHOLE.test(sequence)) {
      result.textContent = 'SEQUENCE_INVALID: enter the epoch and the sequence as whole numbers from 1; nothing was looked up.';
      return;
    }
    const answer = T.locate(view.timeline, Number(epoch), Number(sequence));
    if (!answer.ok) {
      result.textContent = D.notRecordedText(answer, epoch, sequence, view.timeline.kind);
      return;
    }
    result.textContent = `Sequence ${sequence} of epoch ${epoch} is recorded at position ${answer.index + 1}.`;
    moveTo(answer.index);
  }

  function jumpTo(kind, direction) {
    const target = T.jump(view.timeline, view.index, kind, direction);
    if (target === null) say(`No ${direction < 0 ? 'earlier' : 'later'} ${kind} in this recording.`);
    else moveTo(target);
  }

  runs.forEach((run) => {
    const option = node('option', `${run.id}: ${D.clip(run.title, 110)}`);
    option.value = run.id;
    $('saved-run').append(option);
  });
  $('load').addEventListener('click', () => (ids.includes($('saved-run').value) ? loadRun($('saved-run').value, 1) : fail('CHOOSE_A_RUN: choose a saved run first.')));
  $('scrub').addEventListener('keydown', onKey);
  const whenLoaded = (action) => () => { if (view.timeline) action(); };
  $('seq-find').addEventListener('click', whenLoaded(findSequence));
  for (const id of ['seq-epoch', 'seq-number']) $(id).addEventListener('keydown', (event) => { if (event.key === 'Enter') whenLoaded(findSequence)(); });
  $('prev').addEventListener('click', whenLoaded(() => moveTo(view.index - 1)));
  $('next').addEventListener('click', whenLoaded(() => moveTo(view.index + 1)));
  for (const kind of T.JUMPS) {
    $(`prev-${kind}`).addEventListener('click', whenLoaded(() => jumpTo(kind, -1)));
    $(`next-${kind}`).addEventListener('click', whenLoaded(() => jumpTo(kind, 1)));
  }
  window.addEventListener('hashchange', () => applyFragment(location.hash));
  applyFragment(location.hash);
}());
