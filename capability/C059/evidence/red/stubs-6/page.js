(function () {
  'use strict';

  // The conducting journey page: choose a lesson (C041 host) -> conduct one step (C042 contract) -> explicit result -> recovery.
  // Every state change is announced once in the one polite live region; after every action the focus is on a named target.
  const contract = globalThis.C042Contract;
  const journey = globalThis.C059Journey;
  const lessons = globalThis.C041HostPolicy.listLessons();
  const $ = (id) => document.getElementById(id);
  const FIELDS = ['key', 'lease', 'units'];
  const state = { lessonId: null, opened: false, busy: false, input: null, key: null, counter: 1 };
  const host = globalThis.C041LessonHost.createHost({ mountPoint: $('lesson-mount'), status: $('host-note') });
  const radios = [];

  function node(tag, text, attributes = {}) {
    const element = document.createElement(tag);
    element.textContent = text;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  // One write to the live region per state change; data-about says what kind of change it is.
  function announce(text, about) {
    $('status').setAttribute('data-about', about);
    $('status').replaceChildren(document.createTextNode(text));
  }

  const nextKey = () => `demo-key-${String(state.counter++).padStart(4, '0')}`;

  function setDisabled(id, disabled) {
    if (disabled) $(id).setAttribute('aria-disabled', 'true'); else $(id).removeAttribute('aria-disabled');
  }

  function setBusy(busy) {
    state.busy = busy;
    for (const id of ['result', 'step-form']) {
      if (busy) $(id).setAttribute('aria-busy', 'true'); else $(id).removeAttribute('aria-busy');
    }
    setDisabled('submit', busy);
    setDisabled('start-over', busy);
  }

  function clearErrors() {
    for (const field of FIELDS) {
      $(field).removeAttribute('aria-invalid');
      $(field).setAttribute('aria-describedby', `${field}-help`);
      $(`${field}-error`).textContent = '';
      $(`${field}-error`).hidden = true;
    }
    $('error-list').replaceChildren();
    $('error-summary').hidden = true;
  }

  function showResult(view, { empty = false } = {}) {
    const result = $('result');
    result.setAttribute('data-outcome', view.outcome);
    if (view.code) result.setAttribute('data-code', view.code); else result.removeAttribute('data-code');
    result.setAttribute('data-recovery', view.actions.join(' '));
    $('result-heading').textContent = view.heading;
    $('result-empty').hidden = !empty;
    const facts = view.facts ?? [];
    $('facts').replaceChildren(...facts.flatMap(([name, value]) => [node('dt', name), node('dd', value)]));
    $('facts').hidden = facts.length === 0;
    $('did-not').replaceChildren(...(view.didNot ?? []).map((line) => node('li', line)));
    $('did-not-block').hidden = !view.didNot || view.didNot.length === 0;
    $('recovery').replaceChildren(...view.actions.map((name) => {
      const button = node('button', journey.labelOf(name), { id: `recovery-${name}`, type: 'button' });
      button.addEventListener('click', () => act(name));
      return button;
    }));
    const offered = view.actions.length > 0;
    $('recovery-block').hidden = !offered;
    $('recovery-note').hidden = offered || !['rejected', 'unsupported', 'unknown', 'cancelled', 'interrupted', 'succeeded'].includes(view.outcome);
  }

  const blank = (outcome, heading) => ({ outcome, heading, actions: [], code: null, facts: [], didNot: [] });

  function showProblems(problems) {
    const first = new Map();
    for (const problem of problems) if (!first.has(problem.field)) first.set(problem.field, problem);
    for (const [field, problem] of first) {
      $(field).setAttribute('aria-invalid', 'true');
      $(field).setAttribute('aria-describedby', `${field}-help ${field}-error`);
      $(`${field}-error`).textContent = problem.message;
      $(`${field}-error`).hidden = false;
    }
    $('error-list').replaceChildren(...[...first].map(([field, problem]) => {
      const item = document.createElement('li');
      item.appendChild(node('a', `${journey.FIELD_NAMES[field]}: ${problem.message}`, { href: `#${field}` }));
      return item;
    }));
    $('error-summary').hidden = false;
    const view = journey.validationView(problems);
    showResult(blank('validation', view.heading));
    $(FIELDS.find((field) => first.has(field))).focus();
    announce(view.announcement, 'validation');
  }

  const STEPS = Object.freeze({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 });
  const fallback = () => [...(state.input ? ['retry'] : []), ...(state.key ? ['inspect'] : [])];

  // #host-note is the C041 host's own status line, which knows only "mounted" and "nothing mounted": the page keeps it true while a lesson is chosen but closed.
  function hostNote() {
    const lesson = lessons.find((item) => item.id === state.lessonId);
    $('host-note').textContent = lesson ? journey.say.hostChosen(lesson) : journey.say.hostNone();
  }

  function closeLesson({ silent = false } = {}) {
    host.unmount();
    state.opened = false;
    $('lesson-heading').hidden = true;
    $('lesson-heading').textContent = '';
    setDisabled('close-lesson', true);
    hostNote();
    if (silent) return;
    $('open-lesson').focus();
    announce(journey.say.closed(), 'navigation');
  }

  function openLesson() {
    if (state.lessonId === null) return announce(journey.say.chooseFirst(), 'navigation');
    if (state.opened) return $('lesson-heading').focus();
    const selection = host.mount(state.lessonId);
    if (!selection.accepted) return announce(journey.say.refused(), 'navigation');
    state.opened = true;
    $('lesson-heading').textContent = `Lesson ${selection.id}: ${selection.title}`;
    $('lesson-heading').hidden = false;
    setDisabled('close-lesson', false);
    $('lesson-heading').focus();
    return announce(journey.say.opened(selection), 'navigation');
  }

  function choose(index) {
    const lesson = lessons[index];
    radios[index].focus();
    if (state.lessonId === lesson.id) return;
    const closed = state.opened;
    if (closed) closeLesson({ silent: true });
    radios.forEach((radio, position) => {
      radio.setAttribute('aria-checked', position === index ? 'true' : 'false');
      radio.setAttribute('tabindex', position === index ? '0' : '-1');
    });
    state.lessonId = lesson.id;
    hostNote();
    setDisabled('open-lesson', false);
    announce(journey.say.chosen(lesson, closed), 'navigation');
  }

  // The ARIA radio group pattern: arrows move AND choose (wrapping), Space chooses the focused radio, Tab leaves the group.
  function onChooserKey(event) {
    const index = radios.indexOf(event.target);
    if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    if (Object.hasOwn(STEPS, event.key)) {
      event.preventDefault();
      choose((index + STEPS[event.key] + radios.length) % radios.length);
    } else if (event.key === ' ') {
      event.preventDefault();
      choose(index);
    }
  }

  async function interpret(response, expected, signal) {
    let body;
    try {
      body = await response.json();
    } catch (error) {
      if (signal.aborted) throw error;
      return journey.localFailure('ANSWER_REJECTED', fallback(), 'MALFORMED_JSON');
    }
    const view = journey.present({ status: response.status, body }, expected);
    return view.ok ? view : journey.localFailure('ANSWER_REJECTED', fallback(), view.code);
  }

  // One request at a time. `expected` binds the answer to the request ({ key, input }); a request that is not answered within the deadline is aborted.
  async function call(action, method, route, body, expected) {
    setBusy(true);
    showResult(blank('pending', 'Result: working'));
    $('result-heading').focus();
    announce(journey.say.progress(action), 'progress');
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), journey.REQUEST_DEADLINE_MS);
    let view;
    try {
      const options = { method, cache: 'no-store', signal: controller.signal, ...(body === null ? {} : { headers: { 'Content-Type': 'application/json' }, body }) };
      view = await interpret(await fetch(route, options), expected, controller.signal);
    } catch {
      view = journey.localFailure(controller.signal.aborted ? 'NO_ANSWER_IN_TIME' : 'NO_VALID_RESPONSE', fallback());
    } finally {
      clearTimeout(deadline);
    }
    state.view = view;
    showResult(view);
    setBusy(false);
    announce(view.announcement, 'result');
  }

  function correct() {
    const stale = state.view.state === 'cancelled' || state.view.code === 'IDEMPOTENCY_KEY_CONFLICT';
    if (stale) $('key').value = nextKey();
    $('key').focus();
    announce(journey.say.correct(stale ? $('key').value : null), 'navigation');
  }

  // Only the controls a result offers exist, and each is offered only when the page holds what it needs (the input to retry, the key to inspect).
  function act(name) {
    if (state.busy) return undefined;
    if (name === 'correct-and-resubmit') return correct();
    if (name === 'retry') return call('submit', 'POST', '/v1/steps', JSON.stringify(state.input), { key: state.input.idempotencyKey, input: state.input });
    const route = `/v1/steps/${encodeURIComponent(state.key)}`;
    const expected = { key: state.key, input: null };
    return name === 'inspect' ? call('inspect', 'GET', route, null, expected) : call(name, 'POST', `${route}/${name}`, null, expected);
  }

  function onSubmit(event) {
    event.preventDefault();
    if (state.busy) return undefined;
    clearErrors();
    const verdict = journey.validateForm({ key: $('key').value, lease: $('lease').value, units: $('units').value });
    if (!verdict.ok) return showProblems(verdict.problems);
    state.input = verdict.input;
    state.key = verdict.input.idempotencyKey;
    return call('submit', 'POST', '/v1/steps', JSON.stringify(verdict.input), { key: state.key, input: verdict.input });
  }

  function resetForm() {
    $('key').value = nextKey();
    $('lease').value = Object.keys(contract.LEASES)[0];
    $('units').value = '5';
  }

  function startOver() {
    if (state.busy) return;
    if (state.opened) closeLesson({ silent: true });
    radios.forEach((radio, position) => {
      radio.setAttribute('aria-checked', 'false');
      radio.setAttribute('tabindex', position === 0 ? '0' : '-1');
    });
    Object.assign(state, { lessonId: null, input: null, key: null, view: null });
    hostNote();
    setDisabled('open-lesson', true);
    clearErrors();
    resetForm();
    showResult(blank('none', '3. Result: none yet'), { empty: true });
    radios[0].focus();
    announce(journey.say.startOver(), 'navigation');
  }

  lessons.forEach((lesson, index) => {
    const radio = node('div', `${lesson.id}: ${lesson.title}`, { id: `lesson-${lesson.id}`, role: 'radio', 'aria-checked': 'false', tabindex: index === 0 ? '0' : '-1' });
    radio.addEventListener('click', () => choose(index));
    radios.push(radio);
  });
  $('lessons').replaceChildren(...radios);
  $('lessons').addEventListener('keydown', onChooserKey);
  $('lease').replaceChildren(...Object.entries(contract.LEASES).map(([id, capacity]) => node('option', `${id} (${capacity} units)`, { value: id })));
  resetForm();
  $('open-lesson').addEventListener('click', openLesson);
  $('close-lesson').addEventListener('click', () => (state.opened ? closeLesson() : announce(journey.say.noneOpen(), 'navigation')));
  $('step-form').addEventListener('submit', onSubmit);
  $('start-over').addEventListener('click', startOver);
  showResult(blank('none', '3. Result: none yet'), { empty: true });
  announce(journey.say.ready(), 'ready');
  $('page-heading').focus();
}());
