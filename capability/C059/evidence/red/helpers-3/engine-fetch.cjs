'use strict';

// Test tooling, not production code: a fetch backed directly by the C042 engine (no sockets), with the same routes as the
// service, so the page can be driven deterministically. `fail` makes the next call a network failure (no answer at all),
// `next` replaces the next answer, and `engine` may be swapped to simulate a restart over the same journal.
function engineFetch({ engine, parseBody, refusal }) {
  const state = { fail: false, next: null, calls: [], engine };
  const answer = ({ status, body }) => ({
    status, ok: status >= 200 && status < 300, json: async () => JSON.parse(JSON.stringify(body)), text: async () => JSON.stringify(body),
  });
  const fetch = async (route, options = {}) => {
    const method = options.method ?? 'GET';
    state.calls.push(`${method} ${route}`);
    if (state.fail) { state.fail = false; throw new TypeError('network failure'); }
    if (state.next) { const next = state.next; state.next = null; return next(); }
    if (route === '/v1/steps' && method === 'POST') {
      const parsed = parseBody(Buffer.from(options.body ?? ''));
      if (parsed.ok) return answer(await state.engine.submit(parsed.input));
      return answer(refusal(parsed.unsupported ?? parsed.problems[0].code, { action: 'submit', details: parsed.problems ?? [] }));
    }
    const match = /^\/v1\/steps\/([^/]+)(?:\/([a-z-]+))?$/.exec(route);
    if (match && !match[2] && method === 'GET') return answer(state.engine.inspect(match[1]));
    if (match && match[2] === 'cancel' && method === 'POST') return answer(state.engine.cancel(match[1]));
    if (match && match[2] === 'resume' && method === 'POST') return answer(await state.engine.resume(match[1]));
    return answer(refusal('NOT_FOUND'));
  };
  return Object.assign(fetch, { state, answer });
}

module.exports = { engineFetch };
