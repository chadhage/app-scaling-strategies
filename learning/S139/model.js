(function (root) {
  'use strict';
  const MAX_RUNS = 12;
  const MAX_HISTORY = 72;
  const MAX_REJECTIONS = 12;
  const ACTIONS = ['start', 'disconnect', 'reconnect', 'observe', 'measure', 'reset'];
  const MESSAGES = {
    ERR_COMMAND: 'Use an exact fixed preset and an exact supported action record; no arbitrary edits or merge inputs.',
    ERR_STATE: 'Snapshot must exactly match the bounded fixed-data action replay.',
    ERR_PHASE: 'Follow Start, Disconnect, Reconnect, Observe, Measure; reset may archive unfinished uncertainty.',
    ERR_BOUND: 'Finite teaching run or action bound reached. Reset cannot erase retained history.',
  };
  class LessonError extends Error {
    constructor(code) {
      super(MESSAGES[code]);
      this.name = 'LessonError';
      this.code = code;
    }
  }
  const fail = (code) => { throw new LessonError(code); };
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  }
  function equal(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
        || Array.isArray(left) !== Array.isArray(right)) return false;
    const a = Object.keys(left);
    const b = Object.keys(right);
    return a.length === b.length && a.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
  }
  const ACK_01 = {
    editId: 'edit-01', acknowledgmentId: 'ack-01', sequence: 1, documentVersion: 11,
    editorId: 'editor-amber', documentId: 'document-amber',
  };
  const ACK_02 = {
    editId: 'edit-02', acknowledgmentId: 'ack-02', sequence: 2, documentVersion: 12,
    editorId: 'editor-amber', documentId: 'document-amber',
  };
  const ACK_03 = {
    editId: 'edit-03', acknowledgmentId: 'ack-03', sequence: 3, documentVersion: 13,
    editorId: 'editor-amber', documentId: 'document-amber',
  };
  const ORIGINAL = freeze({
    editorId: 'editor-amber', documentId: 'document-amber', clientId: 'client-amber',
    clientVersion: 'teaching-v1', editContract: 'ordered-data/1',
    beforeText: 'draft: amber', beforeVersion: 10,
    acknowledgments: [ACK_01, ACK_02],
    documentText: 'ready: amber + teal', documentVersion: 12,
  });
  const PENDING_EDIT = freeze({
    editId: 'edit-03', editorId: 'editor-amber', documentId: 'document-amber',
    baseVersion: 12, proposedText: 'ready: amber + teal + gold', acknowledged: false,
  });
  const CONFIRMED_PENDING = freeze({
    acknowledgment: ACK_03, documentText: 'ready: amber + teal + gold', documentVersion: 13,
  });
  const reconnect = (overrides = {}) => ({
    connected: true, acknowledgmentReceipt: true, editorId: ORIGINAL.editorId,
    documentId: ORIGINAL.documentId, clientId: ORIGINAL.clientId,
    clientVersion: 'teaching-v1', serverVersion: 'teaching-v2',
    editContract: 'ordered-data/1', ...overrides,
  });
  const observation = (overrides = {}) => ({
    acknowledgments: ORIGINAL.acknowledgments, appliedOrder: ['edit-01', 'edit-02'],
    documentText: ORIGINAL.documentText, documentVersion: ORIGINAL.documentVersion,
    pendingResolution: 'none', mergeAcknowledgment: null, ...overrides,
  });
  const fixture = (label, expected, overrides = {}) => ({
    label, expected, pending: [], reconnect: reconnect(), observation: observation(), ...overrides,
  });
  const PRESETS = freeze({
    preserved: fixture('Preserved acknowledged document', 'preserved'),
    reordered: fixture('Connection/ACK success, reordered effects', 'interrupted', {
      observation: observation({ appliedOrder: ['edit-02', 'edit-01'] }),
    }),
    'lost-edit': fixture('Connection/ACK success, lost acknowledged edit', 'interrupted', {
      observation: observation({ appliedOrder: ['edit-01'], documentText: 'ready: amber', documentVersion: 11 }),
    }),
    'duplicate-edit': fixture('Connection/ACK success, duplicate edit effect', 'interrupted', {
      observation: observation({
        appliedOrder: ['edit-01', 'edit-02', 'edit-02'],
        documentText: 'ready: amber + teal + teal', documentVersion: 13,
      }),
    }),
    'wrong-document': fixture('Connection/ACK success, wrong document text', 'interrupted', {
      observation: observation({ documentText: 'ready: amber + violet' }),
    }),
    'wrong-version': fixture('Connection/ACK success, wrong document version', 'interrupted', {
      observation: observation({ documentVersion: 13 }),
    }),
    'changed-identity': fixture('Connected replacement editor/document', 'interrupted', {
      reconnect: reconnect({ editorId: 'editor-violet', documentId: 'document-violet', clientId: 'client-violet' }),
      observation: observation({
        acknowledgments: [ACK_01, ACK_02].map((ack) => ({
          ...ack, editorId: 'editor-violet', documentId: 'document-violet',
        })),
      }),
    }),
    'incompatible-version': fixture('Connected incompatible v2 edit contract', 'interrupted', {
      reconnect: reconnect({ editContract: 'incompatible-data/2' }),
    }),
    'reconnect-failed': fixture('Fixed reconnect refusal', 'interrupted', {
      reconnect: reconnect({ connected: false, acknowledgmentReceipt: false }),
      observation: observation({ acknowledgments: null, appliedOrder: null, documentText: null, documentVersion: null }),
    }),
    'unobserved-state': fixture('Connected/ACK success, document effects unknown', 'unknown', {
      observation: observation({ acknowledgments: null, appliedOrder: null, documentText: null, documentVersion: null }),
    }),
    'pending-unknown': fixture('Acknowledged state matches, pending merge unknown', 'unknown', {
      pending: [PENDING_EDIT], observation: observation({ pendingResolution: 'unknown' }),
    }),
    'pending-confirmed': fixture('Fixed confirmed pending acknowledgment/snapshot', 'preserved', {
      pending: [PENDING_EDIT],
      observation: observation({
        acknowledgments: [ACK_01, ACK_02, ACK_03], appliedOrder: ['edit-01', 'edit-02', 'edit-03'],
        documentText: CONFIRMED_PENDING.documentText, documentVersion: CONFIRMED_PENDING.documentVersion,
        pendingResolution: 'confirmed', mergeAcknowledgment: ACK_03,
      }),
    }),
  });
  const EXPECTATIONS = freeze(Object.fromEntries(Object.entries(PRESETS).map(([id, preset]) => [id, preset.expected])));

  function record(value, keys, code) {
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const own = Reflect.ownKeys(descriptors);
    if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key))) fail(code);
    for (const key of keys) {
      const property = descriptors[key];
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) fail(code);
    }
    return descriptors;
  }
  function command(value) {
    try {
      if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('ERR_COMMAND');
      const type = Object.getOwnPropertyDescriptor(value, 'type');
      if (!type || !Object.hasOwn(type, 'value') || typeof type.value !== 'string' || !ACTIONS.includes(type.value)) fail('ERR_COMMAND');
      const properties = record(value, type.value === 'start' ? ['type', 'presetId'] : ['type'], 'ERR_COMMAND');
      if (type.value === 'start') {
        const id = properties.presetId.value;
        if (typeof id !== 'string' || !Object.hasOwn(PRESETS, id)) fail('ERR_COMMAND');
        return { type: 'start', presetId: id };
      }
      return { type: type.value };
    } catch (error) {
      if (error instanceof LessonError) throw error;
      fail('ERR_COMMAND');
    }
  }
  function dataTree(value) {
    let nodes = 0;
    const ancestors = new WeakSet();
    function visit(item, depth) {
      if (++nodes > 30000 || depth > 18) fail('ERR_STATE');
      if (item === null || typeof item === 'boolean') return;
      if (typeof item === 'string' && item.length <= 512) return;
      if (typeof item === 'number' && Number.isSafeInteger(item) && item >= 0 && item <= 4096) return;
      if (!item || typeof item !== 'object' || ancestors.has(item)) fail('ERR_STATE');
      const array = Array.isArray(item);
      if (Object.getPrototypeOf(item) !== (array ? Array.prototype : Object.prototype)) fail('ERR_STATE');
      const descriptors = Object.getOwnPropertyDescriptors(item);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string')) fail('ERR_STATE');
      ancestors.add(item);
      if (array) {
        const length = descriptors.length.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 128 || keys.length !== length + 1) fail('ERR_STATE');
        for (let index = 0; index < length; index++) {
          const property = descriptors[index];
          if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) fail('ERR_STATE');
          visit(property.value, depth + 1);
        }
      } else {
        for (const key of keys) {
          const property = descriptors[key];
          if (!Object.hasOwn(property, 'value') || !property.enumerable) fail('ERR_STATE');
          visit(property.value, depth + 1);
        }
      }
      ancestors.delete(item);
    }
    visit(value, 0);
  }

  const empty = () => ({
    schemaVersion: 1, phase: 'idle', runCount: 0, current: null, history: [], outcomes: [],
  });
  const fact = (id, expected, observed, unknown = false) => ({
    id, expected, observed,
    result: observed === null || unknown ? 'unknown' : equal(expected, observed) ? 'pass' : 'fail',
  });
  function evaluate(current, measured) {
    const old = current ? current.original : ORIGINAL;
    const received = current && current.reconnect;
    const observed = current && current.observation;
    const pending = current ? current.pending : [];
    const confirmed = Boolean(observed && pending.length === 1 && observed.pendingResolution === 'confirmed'
      && equal(observed.mergeAcknowledgment, CONFIRMED_PENDING.acknowledgment));
    const expectedAcknowledgments = confirmed ? [...old.acknowledgments, CONFIRMED_PENDING.acknowledgment] : old.acknowledgments;
    const expectedOrder = expectedAcknowledgments.map((ack) => ack.editId);
    const pendingExpected = pending.length
      ? { resolution: 'confirmed', acknowledgment: CONFIRMED_PENDING.acknowledgment }
      : { resolution: 'none', acknowledgment: null };
    const pendingObserved = observed
      ? { resolution: observed.pendingResolution, acknowledgment: observed.mergeAcknowledgment } : null;
    const checks = [
      fact('reconnect', true, received ? received.connected : null),
      fact('acknowledgment-receipt', true, received ? received.acknowledgmentReceipt : null),
      fact('original-identity', {
        editorId: old.editorId, documentId: old.documentId, clientId: old.clientId,
      }, received ? {
        editorId: received.editorId, documentId: received.documentId, clientId: received.clientId,
      } : null),
      fact('version-contract', {
        clientVersion: old.clientVersion, serverVersion: 'teaching-v2', editContract: old.editContract,
      }, received ? {
        clientVersion: received.clientVersion, serverVersion: received.serverVersion, editContract: received.editContract,
      } : null),
      fact('acknowledgments', expectedAcknowledgments, observed ? observed.acknowledgments : null),
      fact('once-only-edit-count', { count: expectedOrder.length, onceOnly: true },
        observed && observed.appliedOrder ? {
          count: observed.appliedOrder.length, onceOnly: new Set(observed.appliedOrder).size === observed.appliedOrder.length,
        } : null),
      fact('acknowledged-order', expectedOrder, observed ? observed.appliedOrder : null),
      fact('document-state', confirmed ? CONFIRMED_PENDING.documentText : old.documentText, observed ? observed.documentText : null),
      fact('document-version', confirmed ? CONFIRMED_PENDING.documentVersion : old.documentVersion, observed ? observed.documentVersion : null),
      fact('pending-merge', pendingExpected, pendingObserved, Boolean(observed && observed.pendingResolution === 'unknown')),
    ];
    const counts = {
      pass: checks.filter((check) => check.result === 'pass').length,
      fail: checks.filter((check) => check.result === 'fail').length,
      unknown: checks.filter((check) => check.result === 'unknown').length,
    };
    const verdict = counts.fail > 0 ? 'interrupted' : measured && counts.unknown === 0 ? 'preserved' : 'unknown';
    return {
      verdict, measured, checks, counts,
      matchesPreset: measured && current ? verdict === EXPECTATIONS[current.presetId] : null,
      nativeResult: 'unverified', sourceParentComplete: false,
    };
  }
  function phase(state, expected) {
    if (state.phase !== expected) fail('ERR_PHASE');
  }
  function apply(state, action) {
    if (action.type === 'reset' && state.phase === 'idle') return state;
    if (state.history.length >= MAX_HISTORY) fail('ERR_BOUND');
    const next = {
      ...state, history: [...state.history, { step: state.history.length + 1, command: action }],
      outcomes: [...state.outcomes],
    };
    if (action.type === 'start') {
      phase(state, 'idle');
      if (state.runCount >= MAX_RUNS) fail('ERR_BOUND');
      next.runCount++;
      next.phase = 'old-acked';
      next.current = {
        runId: next.runCount, presetId: action.presetId, original: ORIGINAL,
        pending: PRESETS[action.presetId].pending, disconnected: false,
        reconnect: null, observation: null, result: null,
      };
    } else if (action.type === 'disconnect') {
      phase(state, 'old-acked');
      next.phase = 'disconnected';
      next.current = { ...state.current, disconnected: true };
    } else if (action.type === 'reconnect') {
      phase(state, 'disconnected');
      next.phase = 'reconnected';
      next.current = { ...state.current, reconnect: PRESETS[state.current.presetId].reconnect };
    } else if (action.type === 'observe') {
      phase(state, 'reconnected');
      next.phase = 'observed';
      next.current = { ...state.current, observation: PRESETS[state.current.presetId].observation };
    } else if (action.type === 'measure') {
      phase(state, 'observed');
      next.phase = 'measured';
      next.current = { ...state.current, result: evaluate(state.current, true) };
      next.outcomes.push({
        runId: state.current.runId, presetId: state.current.presetId,
        completion: 'measured', result: next.current.result,
      });
    } else {
      if (!state.current.result) next.outcomes.push({
        runId: state.current.runId, presetId: state.current.presetId,
        completion: 'reset-before-measure', result: evaluate(state.current, false),
      });
      next.phase = 'idle';
      next.current = null;
    }
    return next;
  }
  function canonical(state) {
    try {
      dataTree(state);
      record(state, ['schemaVersion', 'phase', 'runCount', 'current', 'history', 'outcomes'], 'ERR_STATE');
      if (state.schemaVersion !== 1 || !Array.isArray(state.history) || state.history.length > MAX_HISTORY) fail('ERR_STATE');
      let replay = empty();
      for (let index = 0; index < state.history.length; index++) {
        const event = state.history[index];
        record(event, ['step', 'command'], 'ERR_STATE');
        if (event.step !== index + 1) fail('ERR_STATE');
        replay = apply(replay, command(event.command));
      }
      if (!equal(state, replay)) fail('ERR_STATE');
      return replay;
    } catch (error) {
      if (error instanceof LessonError && error.code === 'ERR_STATE') throw error;
      fail('ERR_STATE');
    }
  }
  const createState = () => freeze(empty());
  const execute = (state, input) => freeze(apply(canonical(state), command(input)));
  const inspect = (state) => {
    const validated = canonical(state);
    return freeze(validated.current && validated.current.result || evaluate(validated.current, false));
  };
  const api = freeze({
    PRESETS, EXPECTATIONS, ORIGINAL, PENDING_EDIT, CONFIRMED_PENDING,
    MAX_RUNS, MAX_HISTORY, MAX_REJECTIONS, LessonError, createState, execute, inspect,
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CollaborativeRehearsal = api;
}(typeof globalThis === 'object' ? globalThis : this));
