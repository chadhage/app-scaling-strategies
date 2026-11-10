'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./helpers.cjs');

// Review findings F14 and F15 (the third independent review of C009), L-0205. C010, C014 and C022 import http-io.cjs and rely on the
// section "http-io.cjs for importers" of the README, so every function, option, listener, Node property and file that section names is
// checked here against the real module and the real tree (a POSITIVE check: a documented name that does not exist fails, and so does
// any backticked token the checker cannot classify). The README documented admit.refuse(socket, code, { immediate }) although the function
// takes two arguments and "immediate" occurs nowhere: a consumer passing it silently got the queue-respecting behaviour. The figures
// the README states (test files and tests) are recomputed from the suite manifest of the newest capture and from the tests directory.
// C009_SUBJECT_DIR points the check at another copy of the namespace (the archived RED replay runs it against the second-fix bytes).
const root = path.resolve(__dirname, '..');
const subject = process.env.C009_SUBJECT_DIR ? path.resolve(process.env.C009_SUBJECT_DIR) : root;
const read = (...parts) => fs.readFileSync(path.join(subject, ...parts), 'utf8');
const SECTION = '### `http-io.cjs` for importers';
const EVENTS = ['checkContinue', 'checkExpectation', 'clientError', 'connect', 'connection', 'listening'];

// The parameters a function declares, from its own source: ['socket', 'code'] or [['depth']] for one destructured options object.
function declaredParameters(fn) {
  const source = Function.prototype.toString.call(fn);
  const open = source.indexOf('(');
  if (open === -1) return null;
  let depth = 0;
  let close = -1;
  for (let index = open; index < source.length && close === -1; index += 1) {
    if ('([{'.includes(source[index])) depth += 1;
    else if (')]}'.includes(source[index]) && (depth -= 1) === 0) close = index;
  }
  return close === -1 ? null : parameterList(source.slice(open + 1, close));
}

function parameterList(text) {
  const items = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current.trim() !== '') items.push(current);
  return items.map((item) => {
    const trimmed = item.trim();
    if (trimmed.startsWith('{')) return trimmed.slice(1, trimmed.lastIndexOf('}')).split(',').map((key) => key.split(/[:=]/)[0].trim()).filter(Boolean);
    return trimmed.split('=')[0].trim();
  });
}

const spansOf = (readme) => {
  const text = readme.replace(/\r\n/g, '\n');
  const start = text.indexOf(SECTION);
  if (start === -1) return null;
  const end = text.indexOf('\n## ', start);
  return [...text.slice(start, end === -1 ? undefined : end).matchAll(/`([^`]+)`/g)].map((match) => match[1].replace(/\s+/g, ' ').trim());
};

// The importer section, checked against the module. Returns a list of problems (empty: every name exists, every parameter and option matches).
function importerProblems(readme) {
  const spans = spansOf(readme);
  if (spans === null) return ['the README has no importer section'];
  const problems = [];
  const api = load('http-io.cjs');
  const lanes = api.createLanes({ depth: 1 });
  const known = { ...api, ...api.createResponder({}), admit: lanes, 'admit.refuse': lanes.refuse };
  const sources = { module: read('http-io.cjs'), server: read('server.cjs') };
  const serverInstance = http.createServer();
  const request = new http.IncomingMessage(new net.Socket());
  const response = new http.ServerResponse(request);
  const calls = spans.map((span) => ({ span, call: /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\((.*)\)$/.exec(span) })).filter(({ call }) => call && call[1] !== 'http.createServer');
  // The options a documented function declares (the sentence "more than `depth` running or queued" names one).
  const optionKeys = new Set(calls.flatMap(({ call }) => (typeof known[call[1]] === 'function' ? (declaredParameters(known[call[1]]) || []).filter(Array.isArray).flat() : [])));
  const label = (items) => items.map((item) => (Array.isArray(item) ? `{ ${item.join(', ')} }` : item)).join(', ');
  for (const span of spans) {
    const call = calls.find((entry) => entry.span === span)?.call;
    if (span.startsWith('http.createServer(')) {
      if (!sources.server.includes('http.createServer({') || !sources.server.includes('requireHostHeader: false')) problems.push(`${span}: server.cjs does not wire the server like this`);
    } else if (call) {
      const target = known[call[1]];
      if (typeof target !== 'function') {
        problems.push(`${span}: ${call[1]} is not exported by http-io.cjs or returned by createResponder or createLanes`);
        continue;
      }
      const declared = declaredParameters(target);
      const documented = parameterList(call[2]);
      if (declared === null || JSON.stringify(documented) !== JSON.stringify(declared)) problems.push(`${span}: documents (${label(documented)}) but ${call[1]} declares (${label(declared || [])})`);
    } else if (/\.(?:cjs|js)$/.test(span)) {
      const name = span.replaceAll('\\', '/');
      if (!fs.existsSync(path.join(subject, name)) && !fs.existsSync(path.join(subject, 'tests', name))) problems.push(`${span}: no such file in the namespace`);
    } else if (span === 'response.req.socket') {
      if (response.req !== request || !('socket' in request)) problems.push(`${span}: Node has no such property`);
    } else if (span === 'response.socket') {
      if (!('socket' in response)) problems.push(`${span}: Node has no such property`);
    } else if (span === 'maxRequestsPerSocket') {
      if (!(span in serverInstance)) problems.push(`${span}: not a property of an http.Server`);
    } else if (span === 'Connection: close') {
      if (!sources.module.includes("Connection: 'close'")) problems.push(`${span}: http-io.cjs never sends it`);
    } else if (EVENTS.includes(span)) {
      if (!new RegExp(`server\\.(?:on|once)\\('${span}'`).test(sources.server)) problems.push(`${span}: server.cjs registers no such listener`);
    } else if (!Object.hasOwn(known, span) && !optionKeys.has(span)) {
      problems.push(`${span}: not exported by http-io.cjs and not an option, listener, Node property or file the checker knows`);
    }
  }
  return problems;
}

test('the importer section of the README names only what http-io.cjs exports and the server wires, with the parameters and options the functions declare', () => {
  assert.deepEqual(importerProblems(read('README.md')), []);
});

test('the check has teeth: a documented option, parameter, function, listener, file or unknown name that does not exist fails by name', () => {
  const readme = read('README.md').replace(/\r\n/g, '\n');
  const begin = readme.indexOf(SECTION);
  const finish = readme.indexOf('\n## ', begin);
  // Edits only inside the importer section, so that a hit elsewhere in the README cannot stand in for it.
  const spoil = (from, to) => {
    const at = readme.indexOf(from, begin);
    assert.ok(at > begin && at < finish, `the importer section contains ${JSON.stringify(from)}`);
    return readme.slice(0, at) + to + readme.slice(at + from.length);
  };
  const call = /`(admit\.refuse\(socket, code[^`]*\))`/.exec(readme.slice(begin, finish));
  assert.ok(call, 'the importer section documents admit.refuse');
  const cases = [
    ['the option the review found', spoil(call[1], 'admit.refuse(socket, code, { immediate })'), /immediate/],
    ['a parameter that is not declared', spoil('`isFinished(socket)`', '`isFinished(socket, extra)`'), /isFinished\(socket, extra\)/],
    ['a function that does not exist', spoil('`readBody`', '`readBody`, `createGate(socket)`'), /createGate/],
    ['an unknown bare name', spoil('`localGuard`', '`localGuard`, `invented`'), /invented/],
    ['a listener the server does not register', spoil('`checkContinue`', '`checkContinue`, `upgrade`'), /upgrade/],
    ['a file that does not exist', spoil('`lanes.test.cjs`', '`lanes.test.cjs`, `tests\\nope.test.cjs`'), /nope\.test\.cjs/],
    ['an option of createLanes that is not declared', spoil('`createLanes({ depth })`', '`createLanes({ depth, window })`'), /createLanes/]
  ];
  for (const [name, text, pattern] of cases) assert.match(importerProblems(text).join('\n'), pattern, name);
  assert.deepEqual(importerProblems(readme), [], 'the unchanged README has no problem');
  assert.deepEqual(importerProblems('# nothing'), ['the README has no importer section']);
});

const FIGURES = /The historical R11 capture has (\d+) files and (\d+) tests(?: \(source record `([^`]+)`\))?/;

function figureProblems(readme, forced) {
  const stated = FIGURES.exec(readme.replace(/\r\n/g, '\n'));
  if (!stated) return ['the README states no historical test-file and test figures'];
  const problems = [];
  const named = forced || stated[3];
  if (!named) return ['the README names no source record for its historical figures'];
  const file = path.join(subject, named);
  if (!fs.existsSync(file)) return ['the named historical source record does not exist'];
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const files = manifest.originalCommand.filter((argument) => /\.test\.cjs$/.test(argument));
  if (Number(stated[1]) !== files.length) problems.push(`the README says ${stated[1]} test files, the historical manifest enumerates ${files.length}`);
  if (Number(stated[2]) !== manifest.summary.tests) problems.push(`the README says ${stated[2]} tests, the historical manifest counts ${manifest.summary.tests}`);
  return problems;
}

test('historical README figures match their named original capture and current test files match their current enumerator', () => {
  assert.deepEqual(figureProblems(read('README.md')), []);
  const suite = require('./u053-suite.cjs');
  assert.deepEqual(fs.readdirSync(path.join(subject, 'tests')).filter((name) => name.endsWith('.test.cjs')).sort(), [...suite.TESTS].sort());
  assert.equal(suite.TESTS.length, 39);
});

test('the figure check has teeth: a stale count, an unstated count or an unnamed manifest fails', () => {
  const readme = read('README.md').replace(/\r\n/g, '\n');
  const match = FIGURES.exec(readme);
  assert.ok(match, 'the README states the figures');
  const capture = match[3];
  assert.ok(capture, 'the historical capture is explicitly named');
  assert.match(figureProblems(readme.replace(match[0], match[0].replace(match[1], String(Number(match[1]) + 1))), capture).join('\n'), /test files/);
  assert.match(figureProblems(readme.replace(match[0], match[0].replace(match[2], String(Number(match[2]) - 1))), capture).join('\n'), /tests, the historical manifest/);
  assert.deepEqual(figureProblems(readme.replace(match[0], 'the namespace has some tests'), capture), ['the README states no historical test-file and test figures']);
  const unnamed = match[0].replace(/ \(source record.*$/, '');
  assert.match(figureProblems(readme.replace(match[0], unnamed)).join('\n'), /names no source record/);
});
