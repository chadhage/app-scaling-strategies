'use strict';

// Test tooling, not production code: a fetch that asks the REAL server and then lies about what it answered, so every forged shape
// starts from a real, honest answer (a server-produced forgery) and the code under test is the real page.js in the DOM stub (F3, L-0139).
const realFetch = globalThis.fetch;

// `get` and `post` receive a deep copy of the honest JSON body and return the body the page will see (or throw to simulate a broken body).
function lying({ get, post } = {}) {
  return (url, init) => {
    const mutate = init && init.method === 'POST' ? post : get;
    if (!mutate) return realFetch(url, init);
    return realFetch(url, init).then(async (res) => {
      const lied = mutate(structuredClone(await res.json()));
      return { status: res.status, json: async () => lied };
    });
  };
}

// A canned answer for a POST, independent of the server (for shapes the honest server never produces).
const canned = (status, body) => (url, init) => (init && init.method === 'POST' ? Promise.resolve({ status, json: async () => body }) : realFetch(url, init));

const affirmative = /\b(was|were|been|is) (cancelled|undone|rolled back|reversed)\b/i;
const refusal = /^Answer rejected: the server's [a-z ]+ contradicts its own facts \([^)]+\)\. No cancellation, undo or completion is claimed\.$/;

// Everything the page shows as text, in one string, so a forged phrase cannot hide in any element.
const everything = (page) => [...['status', 'outcome', 'units', 'lease'].map((id) => page.el(id).textContent), ...['steps', 'facts', 'journal'].flatMap((id) => page.el(id).texts())].join('\n');

const buttons = (page) => Object.fromEntries(['start', 'cancel', 'reconcile', 'compensate', 'refresh'].map((id) => [id, page.el(id).disabled]));

module.exports = Object.freeze({ lying, canned, affirmative, refusal, everything, buttons, realFetch });
