S118 - Global route continuity rehearsal

Training rehearsal - synthetic data - not a live Azure result

Exact source read before design:
  README.md S118: "Global routing failover: Recover through another origin
  without duplicate mutations or lost session state."
  .docs\wiki\backlog.md D-S118: "Add global routing failover during stateful and
  mutating journeys." Acceptance: "Actual alternate-origin use preserves
  identity/state and avoids duplicate effects within supported recovery budgets."
  .docs\wiki\kanban.md A-S118: "Fail over a mutating journey; detect duplicate
  effects or lost identity after rerouting." Frozen class S, SOURCE gate.
  The portable inventory assigns A-S118 and B-S118 to SC-S118. SC-S118 is the
  implicit scenario packet, not a delighter packet with a separate companions row.
  B-S118 requires a real experiment through CORE, DATA, REGION. It is NOT done here.

Scope: only learning\S118, one original portable unit. All failover, routing,
identity, session, state, write, effect, acknowledgement, failure and timing
values are fixed fictional teaching DATA. No network route, resource, identity,
database, session cookie, credential, Azure or other native operation is performed.
Desired routing alone and a lost acknowledgement never certify continuity.

Open index.html directly in a browser. No build, server, packages or framework.
The behavioral stub and BDD precede implementation. RED proof and IaC N/A are
recorded as part of this one unit; they earn no separate completion credit.
Native B-S118, D-S118 and source-parent acceptance remain blocked on actual
approved origin/state/effect evidence and qualified recovery-budget observations.

Operator sequence:
  1. Choose one of eight fixed observation sets and a 1..10 second budget.
  2. Record the mutation. The original effect is recorded with a lost ack.
  3. Observe failover, then retry the SAME fictional operation/key.
  4. Measure alternate-origin use, identity, session, required state, effects,
     retry acknowledgement, failure and the fixed recovery/budget comparison.
  Positive: all recorded checks meet this teaching contract.
  Negative: at least one known breach (duplicates, identity/session/state loss,
  still-observed old origin, failed alternate journey or exceeded budget).
  Unknown: no known breach, but required effect/ack/recovery evidence is absent.
  A known failure takes precedence over unknown measurements.

The preserved fixture recovers in 3000 ms; late recovers in 8000 ms. These are
fixed DATA, not elapsed wall-clock measurements. A retry key alone cannot prove
deduplication: the duplicate fixture deliberately records two effects.
Reset returns to preserved/5, focuses the selector, and retains every history
entry, including partial attempts and reset. Four journeys / at most 20 entries
are allowed per page load; no eviction or persistent browser session storage.
Keyboard Tab reaches the selector, budget and enabled buttons. Enter/Space
advance the ordered actions; focus moves to the next enabled action. Invalid
inputs and unavailable-engine errors are visible, announced and non-mutating.
The hash-authorized theme works under restrictive CSP without unsafe-inline,
unsafe-eval, remote assets, network connectors or a framework.
The CSP test's eval/connection probes execute from an allowed owned local script,
not privileged DevTools evaluation. A DevTools-eval false probe was caught and its
failed raw attempt retained; it is not evidence that the page permits unsafe-eval.

Focused verification from the repository root (READ-ONLY lesson verification):
  node --test learning\S118\tests\model.test.cjs learning\S118\tests\integrity.test.cjs
  node learning\S118\scripts\browser.cjs
  node --check learning\S118\model.js
  node --check learning\S118\app.js
  node --check learning\S118\scripts\browser.cjs

The browser runner always asserts actual DOM/keyboard/errors/reset/history,
all eight outcome fixtures, local engine failure, narrow layout and enforced
CSP denials. It checks lesson bytes before/after observation and writes nothing
normally. Only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures a new,
uniquely named evidence\browser-*.json. Other switch values do not authorize
capture. Set it only for an explicit capture, then remove it before verification.
Capture must precede the final integrity test, which binds the latest evidence
to every current source/test asset.

Proof:
  evidence\red contains the BDD, loadable stub bytes, original check source,
  and raw model/browser assertion failures. Extensions are outside Node test
  autodiscovery; raw bytes are marked -text BEFORE capture, never rewritten.
  evidence\iac-na.json records IaC N/A after RED and before implementation.
  evidence\browser-*.json contains real local browser observations, not native
  failover evidence. Raw output is retained separately from interpreted reports.
  Asset raw SHA-256, raw Git blob and canonical Git blob are separate fields.
  Git canonical text is LF via narrow attributes; Windows-authored source bytes
  may be CRLF. Both are recorded separately. Deliberate capture also archives the
  exact observed source bytes in evidence\browser-*.sources.raw.gz (-text).
  Integrity checks those bytes and their canonical Git blobs, so an LF checkout
  can be verified without pretending it has the original raw CRLF hash.
  Inline CSP hashes follow HTML's CRLF/CR-to-LF parser normalization, not the raw
  file hash. Actual Edge first exposed the raw-hash mistake; its failed attempt
  is preserved. Raw output is untouched. SHA-256 is never equated to a Git id.
  Evidence-only -diff excludes intentionally raw CRLF/source/TAP bytes from text
  whitespace checks. The scoped publisher caught that missing narrow attribute;
  no proof was normalized and no source/global whitespace guard was weakened.

Tooling: use only the published testing\browser\isolated.cjs, SHA-256
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055 (53c0c0d),
openIsolatedLesson and awaited finally close. Existing offline Playwright
1.56.1 / installed Microsoft-signed Edge 156 / Node 22 tooling only. No install,
browser download, unsafe flag, service or foreground lease. The shared helper
has a documented lifecycle limitation; its inactive recovery prototype remains
unqualified. This run is not a general CI, production Node 24, Azure, IaC,
native failover or source-parent validation.

Relevant honest remainder (no extra completion credits):
  D-S118/B-S118: actual approved alternate-origin use, client identity/session/
  required-state continuity, authoritative committed-effect/ack observations
  and supported measured recovery budgets are still required. P006/D-S049 and
  CORE/DATA/REGION/native safety gates are not satisfied by fixture data.
  Catalog C005-C008 and local-harness integration stay parent-owned and untouched.
  The parent alone performs empirical review and one acceptance of this A unit.
