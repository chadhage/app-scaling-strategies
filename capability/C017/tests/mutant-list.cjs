'use strict';

// Test tooling, not production code: the catalogue of named mutants of the guard lines of server.cjs, contract.js and page.js (second and third fix
// cycles: 37 mutants).
// Each mutant is ONE exact text replacement (`find` must occur exactly once in the file, LF-normalised); `tests` are the test files to run against
// the mutated copy, `pattern` optionally narrows them with --test-name-pattern, and `kills` must match the name of at least one FAILING test:
// a mutant is killed only by a NAMED failing test. tests\mutants.cjs runs them (README: exact commands) and archives the result.
const T = (name) => `capability\\C017\\tests\\${name}`;
const SHAPES = [T('refusal-shapes.test.cjs')];
const DRAIN = [T('drain.test.cjs')];
const PANE = [T('journal-pane.test.cjs'), T('page-journal.test.cjs')];
const CHECKS = [T('checks-total.test.cjs')];
const PENDING = [T('pending-flood.test.cjs')];
const LIMITS = [T('limits.test.cjs')];

const mutants = [
  { id: 'S01-no-checkExpectation', file: 'server.cjs', find: "  server.on('checkExpectation', (request, response) => handle(request, response, { expectation: true }));\n", replace: '', tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S02-no-checkContinue', file: 'server.cjs', find: "  server.on('checkContinue', (request, response) => handle(request, response, { continued: true }));\n", replace: '', tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S03-no-clientError', file: 'server.cjs', find: "  server.on('clientError', answerUnparsable);\n", replace: '', tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S04-requireHostHeader-on', file: 'server.cjs', find: ', requireHostHeader: false', replace: '', tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S05-expectation-not-refused', file: 'server.cjs', find: "      if (mode.expectation) return fail('EXPECTATION_FAILED');\n", replace: '', tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S06-writeContinue-removed', file: 'server.cjs', find: '        if (mode.continued) response.writeContinue();\n', replace: '', tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S07-no-Connection-close', file: 'server.cjs', find: ", 'Content-Length': body.length, Connection: 'close' });", replace: ", 'Content-Length': body.length });", tests: SHAPES, kills: /every row of both refusal tables/ },
  { id: 'S08-guard-removed', file: 'server.cjs', find: '    if (taken.has(socket)) {\n      dropBehindFirst(socket);\n      return undefined;\n    }\n', replace: '', tests: SHAPES, kills: /pipelined behind the first request never runs/ },
  { id: 'S09-mark-removed', file: 'server.cjs', find: '    taken.add(socket);\n', replace: '', tests: SHAPES, kills: /pipelined behind the first request never runs/ },
  { id: 'S10-guard-on-response-socket', file: 'server.cjs', find: 'if (taken.has(socket)) {', replace: 'if (taken.has(response.socket)) {', tests: SHAPES, kills: /pipelined behind the first request never runs/ },
  { id: 'S11-guard-HTTP-1.1-only', file: 'server.cjs', find: 'if (taken.has(socket)) {', replace: "if (request.httpVersion === '1.1' && taken.has(socket)) {", tests: SHAPES, kills: /pipelined behind the first request never runs/ },
  { id: 'S12-no-close-after-answer', file: 'server.cjs', find: 'response.end(body, () => closeAfterAnswer(socket));', replace: 'response.end(body);', tests: SHAPES, kills: /every answer is followed by the bounded drain/ },
  { id: 'S13-drain-bytes-1GB', file: 'server.cjs', find: 'const DRAIN_BYTES = 32768;', replace: 'const DRAIN_BYTES = 1073741824;', tests: DRAIN, kills: /documented bounds|cut once it has sent/ },
  { id: 'S14-drain-ms-2800', file: 'server.cjs', find: 'const DRAIN_MS = 1000;', replace: 'const DRAIN_MS = 2800;', tests: DRAIN, kills: /documented bounds|after DRAIN_MS/ },
  { id: 'S15-no-drain-budget', file: 'server.cjs', find: '  if (draining >= MAX_DRAINING) { socket.destroy(); return; }\n', replace: '', tests: DRAIN, kills: /at most MAX_DRAINING/ },
  { id: 'S16-budget-leaks', file: 'server.cjs', find: 'draining -= 1; ', replace: '', tests: DRAIN, kills: /cut once it has sent|at most MAX_DRAINING|already destroyed/ },
  { id: 'S17-no-byte-bound', file: 'server.cjs', find: "  socket.on('data', watch);\n", replace: '', tests: DRAIN, kills: /cut once it has sent/ },
  { id: 'S18-no-drain-timer', file: 'server.cjs', find: 'const timer = setTimeout(cut, DRAIN_MS);', replace: 'const timer = { unref() {} };', tests: DRAIN, kills: /after DRAIN_MS/ },
  { id: 'S19-drops-not-counted', file: 'server.cjs', find: '  dropped.set(socket, count);\n', replace: '', tests: PENDING, kills: /one request more than TOLERATED|the bound counts across reads|answered at once count/ },
  { id: 'S20-never-destroys', file: 'server.cjs', find: '  if (count > MAX_DROPPED) socket.destroy();\n', replace: '', tests: PENDING, kills: /one request more than TOLERATED|the bound counts across reads|answered at once count/ },
  { id: 'S21-bound-off-by-one', file: 'server.cjs', find: 'if (count > MAX_DROPPED) socket.destroy();', replace: 'if (count >= MAX_DROPPED) socket.destroy();', tests: PENDING, kills: /TOLERATED requests behind a pending first request do not cost|the bound counts across reads/ },
  { id: 'S22-bound-1000', file: 'server.cjs', find: 'const MAX_DROPPED = 8;', replace: 'const MAX_DROPPED = 1000;', tests: PENDING, kills: /one request more than TOLERATED|the bound counts across reads|answered at once count/ },
  { id: 'S23-no-maxHeadersCount', file: 'server.cjs', find: '  server.maxHeadersCount = 32;\n', replace: '', tests: LIMITS, kills: /maxHeadersCount/ },
  { id: 'S24-no-maxConnections', file: 'server.cjs', find: '  server.maxConnections = maxConnections;\n', replace: '', tests: LIMITS, kills: /maxConnections/ },
  { id: 'C01-journal-not-replayed', file: 'contract.js', find: "    if (!problems.length && view.journalStatus === 'READABLE') problems.push(...paneOf(view).problems);\n", replace: '', tests: PANE, kills: /every forged journal pane is refused|forged journal pane is refused by the real page/ },
  { id: 'C02-action-not-compared', file: 'contract.js', find: '!derived.action || !sameJson(ledger.actionView(derived.action), view.action)', replace: '!derived.action', tests: PANE, kills: /every forged journal pane is refused|single-point forgeries/ },
  { id: 'C03-epoch-not-compared', file: 'contract.js', find: "if (view.epoch !== derived.epoch) problems.push('the epoch is not the one the journal derives');", replace: '', tests: PANE, kills: /every forged journal pane is refused/ },
  { id: 'C04-windowed-epoch-rule', file: 'contract.js', find: 'const epochOk = windowed && !cur ? e.epoch >= 1 : e.epoch === (cur ? cur.epoch + 1 : 1);', replace: 'const epochOk = e.epoch === (cur ? cur.epoch + 1 : 1);', tests: PANE, kills: /accepted in EVERY window/ },
  { id: 'C05-shape-not-checked', file: 'contract.js', find: '        shape(e, index);\n', replace: '', tests: PANE, kills: /every forged journal pane is refused|one forged line of EVERY type|single-point forgeries/ },
  { id: 'C06-cancel-between-effect-and-completion', file: 'contract.js', find: "if (a.effects.size === a.totalSteps && !a.completed) bad(i, 'cancel request between the last effect and the completion');", replace: '', tests: PANE, kills: /single-point forgeries/ },
  { id: 'C07-foreign-action-lines', file: 'contract.js', find: 'if (!cur || e.actionId !== cur.actionId) bad(index,', replace: 'if (!cur) bad(index,', tests: PANE, kills: /every forged journal pane is refused|one forged line of EVERY type|single-point forgeries/ },
  { id: 'C08-actionStopped-unchecked', file: 'contract.js', find: "    if (body.actionStopped !== (unknownOutcome ? null : body.outcome !== 'CANCEL_TOO_LATE')) problems.push('actionStopped contradicts the outcome');\n", replace: '', tests: CHECKS, kills: /actionStopped and actionCompleted are validated/ },
  { id: 'C09-actionCompleted-unchecked', file: 'contract.js', find: "    if (unknownOutcome ? body.actionCompleted !== false && body.actionCompleted !== null : body.actionCompleted !== (body.outcome === 'CANCEL_TOO_LATE')) problems.push('actionCompleted contradicts the outcome');\n", replace: '', tests: CHECKS, kills: /actionStopped and actionCompleted are validated/ },
  { id: 'C10-checks-not-total', file: 'contract.js', find: 'claimCheck: total(claimCheck), viewCheck: total(viewCheck), startCheck: total(startCheck), reconcileCheck: total(reconcileCheck), failureCheck: total(failureCheck),', replace: 'claimCheck, viewCheck, startCheck, reconcileCheck, failureCheck,', tests: CHECKS, kills: /no check ever throws|a check given anything/ },
  { id: 'P01-unverified-lines-shown', file: 'page.js', find: 'const pane = C.journalPane(next);', replace: 'const pane = { lines: next.journal.map((entry, index) => ({ number: index + 1, entry })), hidden: 0 };', tests: PANE, kills: /does not reach the start of the action/ },
  { id: 'P02-poll-not-rearmed', file: 'page.js', find: 'if (lastLive) timer = setTimeout(() => refresh(), 1000);', replace: '', tests: PANE, kills: /after a refused view the poll/ },
  { id: 'P03-stale-refusal-kept', file: 'page.js', find: "if (viewRejected) { say('outcome', ''); fill(el.facts, []); viewRejected = false; }", replace: '', tests: PANE, kills: /after a refused view the poll/ },
];

module.exports = Object.freeze({ mutants });
