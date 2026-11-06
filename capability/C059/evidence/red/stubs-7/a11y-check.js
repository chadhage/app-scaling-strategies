(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C059A11y', { value: factory() });
}(globalThis, function () {
  'use strict';

  // The accessibility contract as code. Pure and dependency-free: it reads a DOM through tagName, children, attributes,
  // textContent and document.activeElement only, so it runs unchanged against a DOM stub and the real DOM in a browser.
  // check(document, options) -> { ok, findings: [{ code, selector, message }] }. It verifies ARIA semantics and keyboard
  // operability; it is NOT a screen reader and claims nothing about NVDA, JAWS or Narrator.
  const INTERACTIVE_ROLES = new Set(['button', 'link', 'radio', 'checkbox', 'tab', 'menuitem', 'switch', 'textbox', 'combobox', 'option', 'slider']);
  const KNOWN_ROLES = new Set([...INTERACTIVE_ROLES, 'radiogroup', 'group', 'status', 'alert', 'log', 'region', 'navigation', 'main', 'banner',
    'contentinfo', 'list', 'listitem', 'heading', 'presentation', 'none', 'dialog', 'tablist', 'tabpanel', 'search', 'form', 'note']);
  const REFERENCES = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant'];
  const SUCCESS = /\b(?:succeed(?:ed|s)?|success\w*|completed?|done|all set)\b/i;
  const FAILURE = /\b(?:rejected|failed|failure|unsupported|unknown|cancelled|interrupted|not confirmed|error)\b/i;
  const MARKER = { succeeded: /succeeded/i, rejected: /rejected/i, unsupported: /unsupported/i, unknown: /unknown/i, cancelled: /cancelled/i,
    interrupted: /interrupted/i, pending: /conducting|waiting|working/i, validation: /not submitted/i };
  const OPEN_OUTCOMES = ['rejected', 'unsupported', 'unknown', 'cancelled', 'interrupted'];
  // Composite widgets whose members are operated with arrow keys and share ONE roving tab stop (the ARIA radio group and tab list patterns).
  const COMPOSITES = new Map([['radiogroup', { item: 'radio', state: 'aria-checked' }], ['tablist', { item: 'tab', state: 'aria-selected' }]]);
  const REQUIRED_STATE = new Map([['checkbox', ['aria-checked', ['true', 'false', 'mixed']]], ['radio', ['aria-checked', ['true', 'false']]],
    ['switch', ['aria-checked', ['true', 'false']]], ['tab', ['aria-selected', ['true', 'false']]]]);
  const LIVE_DEFAULT = new Map([['status', 'polite'], ['alert', 'assertive'], ['log', 'polite']]);
  // The roles an author may put on a native element (ARIA in HTML, reduced to the elements this page may use); other elements are unconstrained.
  const BUTTONISH = ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'option'];
  const LISTISH = ['list', 'group', 'radiogroup', 'tablist', 'presentation', 'none'];
  const NATIVE_ROLES = new Map([['button', BUTTONISH], ['a', BUTTONISH], ['select', ['combobox']], ['textarea', ['textbox']], ['main', ['main']],
    ['nav', ['navigation', 'presentation', 'none']], ['ul', LISTISH], ['ol', LISTISH], ['li', ['listitem', 'menuitem', 'option', 'tab', 'radio', 'presentation', 'none']],
    ...['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((name) => [name, ['heading', 'tab', 'presentation', 'none']])]);
  const INPUT_ROLES = new Map([['checkbox', ['checkbox', 'switch']], ['radio', ['radio']], ['button', BUTTONISH], ['submit', BUTTONISH], ['reset', BUTTONISH],
    ['image', BUTTONISH], ['text', ['textbox', 'combobox']]]);

  const tag = (element) => element.tagName.toLowerCase();
  const CONTENT_ROLES = new Set(['button', 'link', 'radio', 'checkbox', 'tab', 'menuitem', 'switch', 'option', 'heading']);
  const normalize = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
  const roleOf = (element) => normalize(element.getAttribute('role')).split(' ')[0].toLowerCase();
  const tokens = (value) => normalize(value).split(' ').filter(Boolean);
  const kids = (element) => Array.from(element.children);
  const elementsOf = (document) => {
    const list = [];
    const walk = (element) => { list.push(element); kids(element).forEach(walk); };
    walk(document.documentElement);
    return list;
  };

  function selectorOf(element) {
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && parts.length < 4; node = node.parentNode) {
      const name = tag(node);
      if (node.getAttribute('id')) { parts.unshift(`${name}#${node.getAttribute('id')}`); break; }
      const same = node.parentNode && node.parentNode.nodeType === 1 ? kids(node.parentNode).filter((sibling) => tag(sibling) === name) : [];
      parts.unshift(same.length > 1 ? `${name}:nth-of-type(${same.indexOf(node) + 1})` : name);
    }
    return parts.join(' > ');
  }

  const hiddenByStyle = (node) => /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?\s*(?:;|$)/i.test(node.getAttribute('style') ?? '');

  function textOf(node) {
    if (node.nodeType === 3) return node.textContent;
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true' || hiddenByStyle(node)) return '';
    return Array.from(node.childNodes).map(textOf).join(' ');
  }

  const hiddenBy = (element, options) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.hasAttribute('hidden') || hiddenByStyle(node)) return true;
    return Boolean(options.isHidden && options.isHidden(element));
  };
  // Content inside an aria-hidden ancestor is exposed to nobody: the attribute of the element itself is not the only one that counts.
  const ariaHiddenBy = (element) => {
    for (let node = element; node && node.nodeType === 1; node = node.parentNode) if (node.getAttribute('aria-hidden') === 'true') return true;
    return false;
  };

  // Accessible name with its source, in the order of the accessible name computation (simplified to what this page uses).
  function nameOf(element, document) {
    const referenced = tokens(element.getAttribute('aria-labelledby')).map((id) => document.getElementById(id)).filter(Boolean)
      .map((target) => normalize(target.textContent)).join(' ').trim();
    if (referenced) return { name: referenced, source: 'aria-labelledby' };
    const label = normalize(element.getAttribute('aria-label'));
    if (label) return { name: label, source: 'aria-label' };
    const name = tag(element);
    const id = element.getAttribute('id');
    const control = ['input', 'select', 'textarea'].includes(name);
    if (control) {
      const own = elementsOf(document).find((item) => tag(item) === 'label' && id && item.getAttribute('for') === id);
      const wrapping = own ?? [...ancestors(element)].find((item) => tag(item) === 'label');
      if (wrapping && normalize(textOf(wrapping))) return { name: normalize(textOf(wrapping)), source: 'label' };
      if (name === 'input' && ['button', 'submit', 'reset'].includes(element.getAttribute('type')) && normalize(element.getAttribute('value'))) {
        return { name: normalize(element.getAttribute('value')), source: 'value' };
      }
    } else if (contentNamed(element) && normalize(textOf(element))) return { name: normalize(textOf(element)), source: 'content' };
    const title = normalize(element.getAttribute('title'));
    return title ? { name: title, source: 'title' } : { name: '', source: 'none' };
  }

  function* ancestors(element) {
    for (let node = element.parentNode; node && node.nodeType === 1; node = node.parentNode) yield node;
  }

  const contentNamed = (element) => ['button', 'a', 'summary'].includes(tag(element)) || /^h[1-6]$/.test(tag(element)) || CONTENT_ROLES.has(roleOf(element));

  // A control is anything a person operates: a native control, a link with an href, or an element with an interactive role.
  function isControl(element) {
    const name = tag(element);
    if (name === 'input') return element.getAttribute('type') !== 'hidden';
    if (['button', 'select', 'textarea', 'summary'].includes(name)) return true;
    return (name === 'a' && element.hasAttribute('href')) || INTERACTIVE_ROLES.has(roleOf(element));
  }
  const needsName = (element) => isControl(element) || tag(element) === 'iframe';

  const nativelyFocusable = (element) => {
    const name = tag(element);
    if (element.hasAttribute('disabled')) return false;
    if (name === 'input') return element.getAttribute('type') !== 'hidden';
    return ['button', 'select', 'textarea', 'iframe', 'summary'].includes(name) || (name === 'a' && element.hasAttribute('href'));
  };
  const tabIndexOf = (element) => {
    const given = Number.parseInt(element.getAttribute('tabindex'), 10);
    return Number.isInteger(given) ? given : (nativelyFocusable(element) ? 0 : -1);
  };
  const focusable = (element, options) => !element.hasAttribute('disabled') && !hiddenBy(element, options) &&
    (nativelyFocusable(element) || Number.isInteger(Number.parseInt(element.getAttribute('tabindex'), 10)));

  // The sequential keyboard order: focusable, visible elements with tabindex >= 0 (positive values first, then document order).
  function tabOrder(document, options = {}) {
    const stops = elementsOf(document).filter((element) => focusable(element, options) && tabIndexOf(element) >= 0);
    return [...stops.filter((element) => tabIndexOf(element) > 0).sort((a, b) => tabIndexOf(a) - tabIndexOf(b)), ...stops.filter((element) => tabIndexOf(element) === 0)];
  }

  const descendants = (element) => {
    const list = [];
    const walk = (node) => kids(node).forEach((child) => { list.push(child); walk(child); });
    walk(element);
    return list;
  };
  const liveMode = (element) => normalize(element.getAttribute('aria-live')).toLowerCase() || LIVE_DEFAULT.get(roleOf(element)) || 'off';
  const announces = (element) => ['polite', 'assertive'].includes(liveMode(element));
  const isLive = (element) => announces(element) && !ariaHiddenBy(element);
  const idOf = (element) => element.getAttribute('id') ?? '';
  const inTabOrder = (element, options) => focusable(element, options) && tabIndexOf(element) >= 0;
  // The composite widget (radio group, tab list) whose roving tab stop this member shares; ROVING_TABINDEX checks that it has exactly one stop.
  const groupOf = (element) => [...ancestors(element)].find((node) => COMPOSITES.get(roleOf(node))?.item === roleOf(element)) ?? null;
  // The controls that a Tab walk did not visit, found from the markup (tag and role) and NOT from the focusable set that the order derives from.
  const unreachable = (document, visited, options = {}) => elementsOf(document).filter((element) => !hiddenBy(element, options) && isControl(element) &&
    !element.hasAttribute('disabled') && !visited.includes(element) && groupOf(element) === null);

  function documentRules({ document, elements, add }) {
    const html = document.documentElement;
    if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(normalize(html.getAttribute('lang')))) add('DOC_LANG', html, 'The document language is not set (html lang).');
    if (!normalize(document.title)) add('DOC_TITLE', html, 'The document has no title.');
    const viewport = elements.find((element) => tag(element) === 'meta' && element.getAttribute('name') === 'viewport');
    const content = normalize(viewport && viewport.getAttribute('content')).toLowerCase();
    const maximum = /maximum-scale\s*=\s*([0-9.]+)/.exec(content);
    if (/user-scalable\s*=\s*(?:no|0)/.test(content) || (maximum && Number(maximum[1]) < 2)) add('ZOOM_BLOCKED', viewport, 'The viewport blocks zoom (user-scalable or maximum-scale).');
  }

  function headingRules({ shown, add }) {
    const headings = shown.filter((element) => /^h[1-6]$/.test(tag(element)));
    const ones = headings.filter((element) => tag(element) === 'h1');
    if (ones.length !== 1) add('H1_COUNT', ones[1] ?? headings[0] ?? null, `The page needs exactly one h1; it has ${ones.length}.`);
    let previous = 0;
    for (const heading of headings) {
      const level = Number(tag(heading)[1]);
      if (previous === 0 ? level !== 1 : level > previous + 1) add('HEADING_ORDER', heading, `The heading level jumps from ${previous} to ${level}.`);
      previous = level;
    }
  }

  function landmarkRules({ shown, document, add }) {
    const mains = shown.filter((element) => tag(element) === 'main' || roleOf(element) === 'main');
    if (mains.length !== 1) add('LANDMARK_MAIN', mains[1] ?? document.documentElement, `The page needs exactly one main landmark; it has ${mains.length}.`);
    for (const element of shown.filter((item) => tag(item) === 'nav' || roleOf(item) === 'navigation')) {
      if (!nameOf(element, document).name) add('NAV_NAME', element, 'A navigation landmark needs an accessible name.');
    }
    for (const element of shown.filter((item) => ['radiogroup', 'group', 'region', 'dialog', 'tablist', 'tabpanel'].includes(roleOf(item)))) {
      if (!nameOf(element, document).name) add('GROUP_NAME_MISSING', element, `A ${roleOf(element)} needs an accessible name.`);
    }
  }

  function idRules({ elements, add }) {
    const seen = new Map();
    for (const element of elements.filter((item) => idOf(item))) {
      if (seen.has(idOf(element))) add('ID_DUPLICATE', element, `The id "${idOf(element)}" is used more than once.`); else seen.set(idOf(element), element);
    }
    for (const element of elements) {
      for (const attribute of REFERENCES) {
        for (const id of tokens(element.getAttribute(attribute))) if (!seen.has(id)) add('ARIA_REF_MISSING', element, `${attribute} refers to "${id}", which does not exist.`);
      }
      if (tag(element) === 'label' && element.hasAttribute('for') && !seen.has(element.getAttribute('for'))) {
        add('LABEL_TARGET_MISSING', element, `The label points at "${element.getAttribute('for')}", which does not exist.`);
      }
    }
  }

  function visibleLabel(element, document) {
    if (!['input', 'select', 'textarea'].includes(tag(element))) return textOf(element);
    const label = elementsOf(document).find((item) => tag(item) === 'label' && idOf(element) && item.getAttribute('for') === idOf(element));
    return label ? textOf(label) : '';
  }

  const allowedRoles = (element) => {
    const name = tag(element);
    if (name === 'input') return INPUT_ROLES.get(normalize(element.getAttribute('type')).toLowerCase()) ?? INPUT_ROLES.get('text');
    return name === 'a' && !element.hasAttribute('href') ? null : (NATIVE_ROLES.get(name) ?? null);
  };
  const nativeState = (element) => tag(element) === 'input' && ['checkbox', 'radio'].includes(normalize(element.getAttribute('type')).toLowerCase());

  function nameRules({ shown, document, add }) {
    for (const element of shown) {
      const role = roleOf(element);
      if (role && !KNOWN_ROLES.has(role)) add('ROLE_INVALID', element, `The role "${role}" is not one this page may use.`);
      const allowed = allowedRoles(element);
      if (role && allowed && KNOWN_ROLES.has(role) && !allowed.includes(role)) add('ROLE_MISMATCH', element, `The role "${role}" does not fit a <${tag(element)}> element.`);
      const required = REQUIRED_STATE.get(role);
      if (required && !nativeState(element) && !required[1].includes(element.getAttribute(required[0]))) add('STATE_MISSING', element, `A ${role} needs ${required[0]} with one of: ${required[1].join(', ')}.`);
      if (!needsName(element)) continue;
      const { name, source } = nameOf(element, document);
      if (!name) { add('NAME_MISSING', element, 'This control has no accessible name.'); continue; }
      const visible = source === 'aria-label' || source === 'aria-labelledby' ? normalize(visibleLabel(element, document)) : '';
      if (visible && !name.toLowerCase().includes(visible.toLowerCase())) add('NAME_MISMATCH', element, `The accessible name "${name}" does not contain the visible text "${visible}".`);
    }
  }

  function tabRules({ shown, options, add }) {
    for (const element of shown) {
      const given = Number.parseInt(element.getAttribute('tabindex'), 10);
      if (given > 0) add('TABINDEX_POSITIVE', element, 'A positive tabindex breaks the logical Tab order.');
      if (ariaHiddenBy(element) && focusable(element, options)) add('ARIA_HIDDEN_FOCUSABLE', element, 'A focusable element is hidden from assistive technology.');
      if (element.hasAttribute('disabled') && isControl(element) && given >= 0) add('DISABLED_FOCUSABLE', element, 'A disabled control cannot take focus: its tabindex contradicts the disabled attribute.');
      if (given >= 0 && !isControl(element) && !nativelyFocusable(element)) add('FOCUSABLE_NO_ROLE', element, 'A focusable element needs an interactive role.');
    }
    for (const group of shown.filter((element) => COMPOSITES.has(roleOf(element)))) {
      const { item, state } = COMPOSITES.get(roleOf(group));
      const members = descendants(group).filter((element) => roleOf(element) === item);
      const chosen = members.filter((member) => member.getAttribute(state) === 'true');
      const stops = members.filter((member) => tabIndexOf(member) === 0);
      const wrong = members.length === 0 || chosen.length > 1 || members.some((member) => !['true', 'false'].includes(member.getAttribute(state))) ||
        stops.length !== 1 || stops[0] !== (chosen[0] ?? members[0]) || members.some((member) => member !== stops[0] && tabIndexOf(member) !== -1);
      if (wrong) add('ROVING_TABINDEX', group, `A ${roleOf(group)} has one tab stop (the one with ${state}="true", or the first), tabindex -1 on the others and ${state} on each ${item}.`);
    }
  }

  // Every control is in the Tab order, or is a member of a composite widget with one roving tab stop (arrow keys operate it): no mouse-only control.
  function reachRules({ shown, options, add }) {
    for (const element of shown.filter((item) => isControl(item) && !item.hasAttribute('disabled') && !inTabOrder(item, options) && groupOf(item) === null)) {
      add('CONTROL_NOT_REACHABLE', element, 'This control is not in the Tab order, so a keyboard user cannot reach it.');
      if (nativelyFocusable(element) || Number.isInteger(Number.parseInt(element.getAttribute('tabindex'), 10))) add('TABINDEX_NEGATIVE', element, 'A negative tabindex removes this control from the Tab order.');
      else add('ROLE_NOT_FOCUSABLE', element, 'An element with an interactive role needs a tabindex to take focus.');
    }
  }

  function liveRules({ shown, document, add }) {
    for (const region of shown.filter((element) => LIVE_DEFAULT.has(roleOf(element)) || element.hasAttribute('aria-live'))) {
      if (LIVE_DEFAULT.has(roleOf(region)) && !announces(region)) add('LIVE_REGION_OFF', region, 'A live region whose aria-live is off (or not polite or assertive) announces nothing.');
      if (announces(region) && ariaHiddenBy(region)) add('LIVE_REGION_HIDDEN', region, 'A live region inside aria-hidden content announces nothing.');
    }
    const live = shown.filter(isLive);
    const polite = live.filter((element) => liveMode(element) === 'polite');
    if (live.length === 0) add('LIVE_REGION_MISSING', document.documentElement, 'There is no visible, exposed polite live region (role=status or aria-live=polite).');
    else if (live.length > 1 || polite.length !== 1 || roleOf(live[0]) === 'alert') add('LIVE_REGION_COUNT', live[1] ?? live[0], 'Exactly one polite live region is allowed, and no alert or assertive region.');
  }

  const OUTCOME_WORD = { succeeded: 'succeeded', rejected: 'rejected', unsupported: 'unsupported', unknown: 'unknown', cancelled: 'cancelled', interrupted: 'interrupted', validation: 'not submitted' };

  // The live region must tell the truth about the state element ([data-outcome]) and name the typed code and offered actions.
  function announcementRules({ shown, document, add }) {
    const live = shown.filter(isLive);
    const state = shown.find((element) => element.hasAttribute('data-outcome'));
    if (live.length !== 1 || !state) return;
    const outcome = state.getAttribute('data-outcome');
    const text = normalize(textOf(live[0]));
    const about = live[0].getAttribute('data-about') || 'result';
    if (outcome !== 'succeeded' && SUCCESS.test(text)) add('ANNOUNCEMENT_CONTRADICTS_STATE', live[0], `The announcement claims success while the state is "${outcome}".`);
    if (about === 'progress' && outcome !== 'pending') add('ANNOUNCEMENT_CONTRADICTS_STATE', live[0], 'A progress announcement needs the pending state.');
    if (about !== 'result' || outcome === 'none') return;
    if (outcome === 'succeeded' ? !MARKER.succeeded.test(text) || FAILURE.test(text) : !(MARKER[outcome] ?? /./).test(text)) {
      add('ANNOUNCEMENT_CONTRADICTS_STATE', live[0], `The announcement does not match the state "${outcome}".`);
    }
    const code = state.getAttribute('data-code');
    if (OPEN_OUTCOMES.includes(outcome) && code && !text.includes(code)) add('ANNOUNCEMENT_INCOMPLETE', live[0], `The announcement must name the typed code ${code}.`);
    const offered = descendants(state).filter((element) => tag(element) === 'button' && !hiddenBy(element, {}));
    for (const button of offered.filter((item) => !text.toLowerCase().includes(nameOf(item, document).name.toLowerCase()))) {
      add('ANNOUNCEMENT_INCOMPLETE', live[0], `The announcement must name the offered action "${nameOf(button, document).name}".`);
    }
    if (tokens(state.getAttribute('data-recovery')).length !== offered.length) add('RECOVERY_MISMATCH', state, 'The offered recovery actions and the recovery buttons differ.');
  }

  function statusRules(context) {
    const { shown, add } = context;
    for (const element of shown) {
      const classes = tokens(element.getAttribute('class'));
      const busy = element.getAttribute('data-busy') === 'true' || element.getAttribute('data-outcome') === 'pending' || classes.some((name) => /^(?:is-)?busy$/.test(name));
      if (busy && element.getAttribute('aria-busy') !== 'true') add('BUSY_NOT_PROGRAMMATIC', element, 'A busy state must also be programmatic: aria-busy="true".');
      const disabled = element.getAttribute('data-disabled') === 'true' || classes.some((name) => /^(?:is-)?disabled$/.test(name));
      if (disabled && element.getAttribute('aria-disabled') !== 'true' && !element.hasAttribute('disabled')) add('DISABLED_NOT_PROGRAMMATIC', element, 'A disabled state must also be programmatic: aria-disabled="true" or disabled.');
    }
    const states = shown.filter((element) => element.hasAttribute('data-outcome'));
    if (states.length > 1) add('STATE_AMBIGUOUS', states[1], 'More than one element claims the outcome state.');
    const word = states[0] && OUTCOME_WORD[states[0].getAttribute('data-outcome')];
    if (word && !normalize(textOf(states[0])).toLowerCase().includes(word)) add('COLOUR_ONLY', states[0], `The outcome "${word}" must be shown as text, not by colour or symbol alone.`);
    announcementRules(context);
  }

  function errorRules({ shown, document, options, add }) {
    const invalid = shown.filter((element) => element.getAttribute('aria-invalid') === 'true');
    const isMessage = (target) => target && /-error$/.test(idOf(target)) && !hiddenBy(target, options) && normalize(textOf(target));
    for (const field of invalid) {
      if (!tokens(field.getAttribute('aria-describedby')).map((id) => document.getElementById(id)).some(isMessage)) add('ERROR_FIELD_UNDESCRIBED', field, 'An invalid field must be described (aria-describedby) by its visible error message.');
    }
    for (const message of shown.filter((element) => /-error$/.test(idOf(element)) && normalize(textOf(element)))) {
      const owner = shown.find((element) => tokens(element.getAttribute('aria-describedby')).includes(idOf(message)));
      if (!owner || owner.getAttribute('aria-invalid') !== 'true') add('ERROR_STALE', message, 'A visible error message belongs to a field that is not marked aria-invalid.');
    }
    const summary = document.getElementById('error-summary');
    const showing = summary && !hiddenBy(summary, options);
    if (invalid.length > 0) {
      const links = showing ? descendants(summary).filter((element) => tag(element) === 'a').map((link) => link.getAttribute('href')) : [];
      if (invalid.some((field) => !links.includes(`#${idOf(field)}`))) add('ERROR_SUMMARY_MISSING', summary ?? invalid[0], 'An error summary must list a link to every invalid field.');
      if (options.afterSubmit && document.activeElement !== invalid[0]) add('ERROR_FOCUS', invalid[0], 'The first invalid field must have the focus after a submit.');
    } else if (showing) add('ERROR_SUMMARY_STALE', summary, 'The error summary is shown although no field is invalid.');
  }

  function focusRules({ document, options, add }) {
    const active = document.activeElement;
    if (!active || tag(active) === 'body' || active === document.documentElement) {
      add('FOCUS_LOST', active ?? document.documentElement, 'After an action the focus must be on a named, visible control; it is on the body.');
      if (options.previousFocus && !options.previousFocus.isConnected) add('FOCUS_DETACHED', options.previousFocus, 'The focused element was removed from the page.');
    } else if (!document.documentElement.contains(active) || active.isConnected === false) add('FOCUS_DETACHED', active, 'The focus is on an element that is not in the page.');
    else if (hiddenBy(active, options) || active.hasAttribute('disabled')) add('FOCUS_HIDDEN', active, 'The focus is on a hidden or disabled element.');
    else if (!nameOf(active, document).name && !normalize(textOf(active))) add('FOCUS_UNNAMED', active, 'The focused element has no accessible name.');
  }

  const RULES = [documentRules, headingRules, landmarkRules, idRules, nameRules, tabRules, reachRules, liveRules, statusRules, errorRules, focusRules];

  function check(document, options = {}) {
    const elements = elementsOf(document);
    const findings = [];
    const context = {
      document, options, elements, findings, shown: elements.filter((element) => !hiddenBy(element, options)),
      add: (code, element, message) => findings.push({ code, selector: element ? selectorOf(element) : 'document', message }),
    };
    for (const rule of RULES) rule(context);
    return { ok: findings.length === 0, findings };
  }

  // Walks the sequential order with real key presses supplied by the caller (press(key, { shift })). A trap is a press that does
  // not move the focus, or a cycle that closes without reaching every tab stop. A control that Tab never reaches is found from the
  // markup (unreachable()), so it is reported even when the order, derived from the focusable set, does not contain it.
  function walkTab({ document, press, shift = false, limit, options = {} }) {
    const order = tabOrder(document, options);
    const visited = [];
    const findings = [];
    let current = document.activeElement;
    if (order.includes(current)) visited.push(current);
    for (let step = 0; order.length > 0 && step < (limit ?? order.length + 2); step += 1) {
      press('Tab', { shift });
      const next = document.activeElement;
      if (next === current && order.length > 1) {
        findings.push({ code: 'KEYBOARD_TRAP', selector: selectorOf(current), message: 'Tab does not move the focus out of this element: a keyboard trap.' });
        break;
      }
      if (visited.includes(next)) break;
      visited.push(next);
      current = next;
    }
    const missing = order.filter((element) => !visited.includes(element));
    if (findings.length === 0 && missing.length) findings.push({ code: 'KEYBOARD_TRAP', selector: selectorOf(missing[0]), message: `The Tab cycle never reaches ${missing.length} tab stop(s).` });
    if (findings.length === 0) {
      for (const element of unreachable(document, visited, options)) findings.push({ code: 'CONTROL_NOT_REACHABLE', selector: selectorOf(element), message: 'Pressing Tab never reaches this control.' });
    }
    return { trapped: findings.length > 0, visited, findings };
  }

  // Removes every @media block whose header matches `wanted` (balanced braces) and returns what is left and the bodies that were removed.
  function extractBlocks(css, wanted) {
    let rest = css;
    const bodies = [];
    for (;;) {
      const header = /@media[^{]*\{/gi;
      let found = null;
      for (let match = header.exec(rest); match && !found; match = header.exec(rest)) if (wanted.test(match[0])) found = match;
      if (!found) return { rest, bodies };
      const open = found.index + found[0].length - 1;
      let depth = 0;
      let end = open;
      for (; end < rest.length; end += 1) {
        if (rest[end] === '{') depth += 1;
        else if (rest[end] === '}' && --depth === 0) break;
      }
      bodies.push(rest.slice(open + 1, end));
      rest = rest.slice(0, found.index) + rest.slice(end + 1);
    }
  }

  const declarations = (body) => body.split(';').map((part) => [part.slice(0, Math.max(part.indexOf(':'), 0)).trim().toLowerCase(), part.slice(part.indexOf(':') + 1).replace(/!important/i, '').trim()])
    .filter(([property]) => property !== '');
  const cssRules = (css) => Array.from(String(css).matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({ parts: match[1].split(',').map(normalize), decls: declarations(match[2]) }));
  const ZERO = /^(?:0+|0*\.0+)[a-z%]*$/i;
  const LENGTH = /^\d*\.?\d+(?:px|pt|pc|cm|mm|in|em|rem|ex|ch)$/i;

  // null when the rule says nothing about the outline, else whether an outline would still be visible (none, zero width and transparent are not).
  function outlineShown(decls) {
    let shown = null;
    for (const [property, value] of decls.filter(([name]) => /^outline(?:-style|-width|-color)?$/.test(name))) {
      const words = value.toLowerCase().split(/\s+/);
      const off = (property === 'outline-style' && words[0] === 'none') || (property === 'outline-width' && ZERO.test(words[0])) ||
        (property === 'outline-color' && words[0] === 'transparent') || (property === 'outline' && words.some((word) => word === 'none' || word === 'transparent' || ZERO.test(word)));
      shown = property === 'outline' ? !off : (shown ?? true) && !off;
    }
    return shown;
  }
  const shadowShown = (decls) => decls.some(([property, value]) => property === 'box-shadow' && !/^none\b/i.test(value));
  const NO_MOTION = /^(?:none|0(?:\.0*1?)?m?s?)$/i;
  const isMotion = ([property, value]) => (/^(?:transition|animation)(?:-duration)?$/.test(property) && !NO_MOTION.test(value)) || (property === 'scroll-behavior' && /^smooth\b/i.test(value));
  const isStill = ([property, value]) => (/^(?:transition|animation)$/.test(property) && /^none\b/i.test(value)) || (/^(?:transition|animation)-duration$/.test(property) && NO_MOTION.test(value)) ||
    (property === 'scroll-behavior' && /^auto\b/i.test(value));

  // Static rules for the style sheet: a visible focus indicator, reduced motion honoured for every animated selector, no clipping and relative
  // font sizes. Heuristics on parsed declarations, not a cascade engine: it does not compute specificity, inheritance or computed styles.
  function checkStyles(css) {
    const reduced = extractBlocks(String(css).replace(/\/\*[\s\S]*?\*\//g, ''), /prefers-reduced-motion\s*:\s*reduce/i);
    const calm = extractBlocks(reduced.rest, /prefers-reduced-motion\s*:\s*no-preference/i);
    const printed = extractBlocks(calm.rest, /@media[^{]*\bprint\b/i);
    const rules = cssRules(printed.rest);
    const stills = reduced.bodies.flatMap(cssRules);
    const findings = [];
    const add = (code, parts, message) => findings.push({ code, selector: parts.join(', '), message });
    const focusRules = rules.filter((rule) => rule.parts.some((part) => /:focus(?:-visible)?\b/.test(part) && !/:not\(\s*:focus-visible\s*\)/.test(part)));
    const removing = focusRules.find((rule) => outlineShown(rule.decls) === false && !shadowShown(rule.decls));
    if (!focusRules.some((rule) => outlineShown(rule.decls) === true || shadowShown(rule.decls)) || removing) {
      add('FOCUS_INDICATOR_MISSING', removing ? removing.parts : ['stylesheet'], 'Focus must have a visible indicator (:focus-visible with an outline or box-shadow), never removed.');
    }
    const covered = (rule) => stills.some((calmer) => calmer.decls.some(isStill) && (calmer.parts.includes('*') || rule.parts.every((part) => calmer.parts.includes(part))));
    const motion = rules.find((rule) => rule.decls.some(isMotion) && !covered(rule));
    if (motion) add('REDUCED_MOTION_IGNORED', motion.parts, 'Motion needs an @media (prefers-reduced-motion: reduce) rule that turns it off for this selector (or for *).');
    const clipped = rules.find((rule) => rule.decls.some(([property, value]) => /^overflow(?:-[xy])?$/.test(property) && /^(?:hidden|clip)\b/i.test(value)) &&
      rule.decls.some(([property, value]) => /^(?:max-)?height$/.test(property) && LENGTH.test(value)));
    if (clipped) add('TEXT_CLIPPING_RISK', clipped.parts, 'A fixed height with hidden overflow clips text when it is resized or zoomed.');
    const fixed = [...rules, ...stills].find((rule) => rule.decls.some(([property, value]) => property === 'font-size' && /^\d*\.?\d+(?:px|pt)$/i.test(value)));
    if (fixed) add('FIXED_FONT_SIZE', fixed.parts, 'Font sizes must be relative (rem, em or %) so that text resizing works.');
    return { ok: findings.length === 0, findings };
  }

  return Object.freeze({ accessibleName: nameOf, check, checkStyles, normalize, selectorOf, tabOrder, unreachable, walkTab });
}));
