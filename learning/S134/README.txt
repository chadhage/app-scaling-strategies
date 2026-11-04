A-S134 — CHECKOUT RETRY LEDGER REHEARSAL
S134 / D-S134 / SC-S134 / frozen S / original kanoUnit A-S134

Training rehearsal - synthetic data - not a live Azure result

SOURCE CONTRACT, READ BEFORE DESIGN
README S134: Checkout/order submission: Produce one order with the correct
result despite retries or routing changes.
D-S134 (P0, dependency D-S049): Add synthetic checkout/order submission with
response-loss and retry controls.
Exact acceptance: Exactly one intended order/effect is recorded with a correct
client result or explicit unresolved failure.
A-S134 / SOURCE: Retry checkout after response loss; select the ledger showing
one correct order.
SC-S134 contains independent original A-S134 and B-S134 units. This lesson does
not consume, complete or borrow credit from B-S134.
Portable contract: standalone browser lesson, operator action, inspected
synthetic trace, checked result, exact banner, keyboard operation, no management.

OPEN AND OPERATE
Open learning\S134\index.html directly in a browser. No listener, install,
framework, cloud resource or account is needed.
1. Enter only CHECKOUT-DEMO-01 and load response-loss DATA.
2. Reveal the fictional retry comparison.
3. Inspect all seven alternative ledgers: counts AND linked order/effect/payment
   marker IDs, preserved identity/cart state, exact key, ACK and response.
4. Select one exact ledger and measure it.
Native Tab, Enter and Space work; labels and a 3px keyboard focus outline are
provided. Stage-held buttons remain reachable to explain safe-hold errors.
Errors do not change state or history. Reset clears only this page's memory,
restores the exact token and ledger placeholder, and focuses the token.
HTMLFormElement.prototype.reset.call(form) avoids form.reset shadowing.
There are four measured runs / sixteen actions maximum, without history pruning.
Only explicit reset starts a new in-memory rehearsal.

DOMAIN BOUNDARY — DATA ONLY
Every checkout, order, payment marker, effect, key, acknowledgement, response,
identity, route and state observation is FIXED FICTIONAL TEACHING DATA ONLY.
No actual payment, business, user-data, network or database operation occurs.
There are no amounts, card details, customer records, credentials or transactions.
PAYMENT-DEMO-01 is a text marker, not a charge. ROUTE-v1-DATA and ROUTE-v2-DATA
are labels, not requests or deployments. "200 DATA" is not a real HTTP response.
The alternatives are separate fictional cases, not seven cumulative orders.
Only the local DOM and test assertions are actually executed.

WHAT THE COUNTS MEAN
kept-key: positive bounded DATA, two attempts but one matching order/effect/
payment marker, stable key/identity/cart and a correct acknowledged result.
fresh-key: negative DATA, two orders/effects/payment markers after the unsafe
different-key comparison. An acknowledgement and 200 DATA cannot conceal it.
wrong-response: one recorded order, but the response names a different order.
lost-state / wrong-identity: the recorded count alone cannot certify preserved
cart state or client identity.
unacknowledged: one known correct order/effect/payment marker, but client
completion is unresolved. This is UNKNOWN, not a successful checkout.
unobserved: orders/effects/payment markers and final state remain null/UNKNOWN,
never zero, absent, failed or successful.
A missing acknowledgement is neither failure nor success nor permission for a
duplicate order. The exact source criterion's "explicit unresolved failure"
means an explicitly unresolved client result here; it never infers order failure.
The original response-loss interruption and first effect outcome UNKNOWN AT
THE BOUNDARY remain in EVERY run, including positive recovery. Later
reconciliation does not rewrite history or erase earlier negatives/unknowns.
Exact typed own-data records, dense arrays, allowlists and ordered deterministic
history replay reject coercion, accessors, hidden fields, forged observations,
optimistic results and out-of-order commands without mutating their input.

BDD, RED, IaC N/A AND VERIFICATION
checkout.feature was written first. A loadable browser stub was keyboard-observed
before a genuine model assertion RED: expected lost, actual ready, ERR_ASSERTION.
evidence\red-stub\ retains the exact stub and assertions.cjs; evidence\raw\
retains raw stdout/stderr, hashes, the stub browser observation and RED summary.
The original BDD CRLF bytes are separately retained in red-stub\checkout.feature
and checked against the pre-RED measured SHA-256; active BDD text is canonical LF.
They are outside ordinary test autodiscovery. Tool or import failures are not RED.
IaC was evaluated N/A AFTER genuine assertion RED: this fixed-data standalone
lesson has no infrastructure or side effects. No IaC was generated.

From repository root, using the EXISTING approved offline test tooling:
  node --test learning\S134\model.test.cjs learning\S134\integrity.test.cjs learning\S134\browser.test.cjs
  node --check learning\S134\model.js
  node --check learning\S134\app.js
  node --check learning\S134\model.test.cjs
  node --check learning\S134\integrity.test.cjs
  node --check learning\S134\browser.test.cjs
  node --check learning\S134\evidence\csp-probe.js

NORMAL VERIFICATION IS READ-ONLY. It never rewrites lesson files, raw RED,
historical browser captures or the source-hash manifest. The browser test compares
the entire owned tree before/after, and ordinary runs produce only console output.
Only the exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates a NEW uniquely
named evidence\raw\browser-observation-*.json with exclusive-create flag wx.
"true", "01", "0", an unset flag or any other value cannot capture. To capture
deliberately in a fresh PowerShell process:
  $env:CAPTURE_BROWSER_EVIDENCE='1'; node --test learning\S134\browser.test.cjs
No existing capture is replaced; a failed browser check is not labeled a pass.

.gitattributes was added before raw proof: active text is canonical LF, while
evidence\raw\ and evidence\red-stub\ retain raw bytes (-text -diff).
evidence\source-hashes.json separates measured raw byte SHA-256 and CRLF counts,
canonical LF SHA-256, and actual Git-filtered SHA-1 blob identity. Raw proof can
retain CRLF even when its separately computed LF comparison digest differs.
Git-filter checks use each file's actual directory and a leaf --path so Windows
backslashes cannot accidentally bypass the raw-preserving attribute patterns.
The hash manifest does not hash itself or later unique captures; browser tests
independently compare ALL existing owned files without rewriting any proof.

The actual browser tests use only testing\browser\isolated.cjs, published at
53c0c0d, SHA-256:
86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
openIsolatedLesson launches a fresh HEADLESS Edge and close is awaited in finally.
Observed pair: existing offline Playwright 1.56.1, Microsoft-signed installed
Edge 156.0.4314.50 and Node 22.23.4. No packages or browsers are downloaded.
The published helper's known unattended context/page/cleanup lifecycle
limitations remain; the inactive recovery prototype is UNQUALIFIED and unused.
No unsafe flags, global profiles, foreground leases or unrelated process cleanup.
Real DOM, keyboard, errors, reset (including shadowed reset), missing-model
failure and actual CSP denial are checked. CSP probes use local-file targets;
no external network request, socket or service is created.
CSP eval is checked by an ordinary external self-script in evidence\csp-probe.js,
loaded only by the test, never the lesson entry. Privileged Playwright evaluation
was observed to permit eval, so it is not used as native eval-denial evidence.

HONEST RELEVANT TO DO REMAINDER
B-S134 / original B-S134 Kano unit: readiness=false, blocked until an approved
isolated synthetic native target and CORE, DATA, HOST evidence exist; parent
D-S049 dependency and original D-S134 acceptance are still required. B-S134 must
measure REAL approved response-loss/retry/routing behavior, exact order/effect
counts, key/identity/state and correct client result or honest unresolved outcome
with bounded retry and cleanup. No payment/business/user-data authorization is
inferred. This documentation records the blocker; it does not edit an unowned
ledger, award native proof or manufacture another card.
The source parent is incomplete. Node.js 24 production support, actual payment,
database/network behavior, Azure outcomes and reliability guarantees are unproven.
C005-C008 and local-harness catalog integration are PARENT-OWNED and untouched.
Parent alone accepts A-S134 once; zero extra credits for tests, proof, repairs,
refinement, repeated runs or publication. This worker stops after this one mission.
