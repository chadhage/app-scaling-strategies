# S050 — Account for pinned clients before retirement

**Training rehearsal - synthetic data - not a live Azure result**

A-S050 · D-S050 · SC-S050 · frozen Kano S · owner `worker-A-S050`.

The exact [S050 source](../../README.md#e-in-flight-requests-and-long-lived-work)
requires keeping the old destination usable until remaining traffic is accounted for.
The [D-S050 backlog](../../.docs/wiki/backlog.md#e-in-flight-requests-and-long-lived-work)
adds stale keep-alive/pinned clients, a dependency viewer, and blocking or explicitly
counting premature retirement as interruption. The portable A card specifically
requires exposing remaining stale connections/cookies. These inputs and the
portable/card/packet contract were read before behavior design; their exact entries
and fingerprints are retained in `evidence/source-contract.json`.

## Conduct the exercise

Open `index.html` directly in a modern browser. No server, account, subscription,
credentials, package installation, or framework is needed.

1. Keep the defaults and use the three ordered actions: **Route new arrivals**,
   **Resolve dependencies**, **Request retirement**. The first action moves only
   `fresh-1`; the viewer still names three required old dependencies. Reconnect,
   rebind, finish and a verified final work receipt account for all four fixed
   clients. Guarded retirement then retires old: **success**, 4 completed.
2. Select **Another attempt**. Leave the keep-alive connection stale, the cookie
   pin stale, and work pending. Fresh arrivals still succeed on candidate, but
   guarded retirement is blocked: **safe-abort**, old usable, 3 clients still
   required. This is safe retention, not proof of successful migration.
3. Keep those conditions but select **Force**. Retirement interrupts exactly the
   three still-required clients: **failure**, 1 completed / 3 interrupted.
   The failed dependency inventory remains visible.
4. Reconnect/rebind/finish with **Missing final work receipt**: `work-1` remains
   **unknown**, 3 completed / 1 unknown; guarded retirement retains old. Forcing
   this scenario still cannot claim success. A stale connection plus missing
   work receipt and force yields failure with both 1 interrupted and 1 unknown.
5. Try each individual old dependency. Reconnecting does not finish admitted
   work; rebinding a routing pin does not release a keep-alive connection.
   Known pending work stays known pending even when its final receipt is missing.

All four started client checks remain in the denominator. The viewer distinguishes
required, resolved and unknown dependency accounting. Per-client outcomes, result,
user impact, and cleanup are separate. A correct **prediction verifier** can pass
for an interrupted experiment without rewriting its recorded failure.

All controls are keyboard operable. Focus advances through actions to prediction;
visible errors do not advance state. Configuration locks during attempts. Six
outcomes, their configurations and traces remain in memory without pruning.
Attempt seven is blocked. **Reset rehearsal** explicitly restores exact defaults
and clears history, trace, prediction and errors; page reload also clears memory.
There is no real browser cookie, connection, or authentication implementation.

## Verification

Run from the repository root in PowerShell:

```powershell
node --test .\learning\S050\tests\model.test.cjs .\learning\S050\tests\surface.test.cjs .\learning\S050\tests\integrity.test.cjs
node --test .\learning\S050\tests\browser.test.cjs
```

The focused suite includes syntax checks, all 32 bounded configurations, strict
input/state guards, outcome conservation, retained failures/unknowns and reset.
The browser suite uses only published `testing\browser\isolated.cjs`, SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
(`53c0c0d`), `openIsolatedLesson`, and awaited `finally` close. Existing offline
Playwright 1.56.1, signed Edge 156.0.4314.50 and Node 22.23.4 are test tooling only;
the helper's known overall lifecycle-deadline limitation is not claimed solved.
No unsafe flags, foreground lease, download, package change or abandoned
lifecycle prototype is involved.

Normal verification is **read-only to retained proof**. Deliberate capture only:

```powershell
node .\learning\S050\capture.cjs focused
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S050\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Capture creates numbered run records; it never replaces prior raw runs. BDD in
`retirement.feature` preceded the loadable model stub and genuine `ERR_ASSERTION`
RED (`unknown` versus expected `success`). Raw stdout/stderr, TAP, command,
timestamps, hashes and exact `.snapshot` source/test/BDD files preserve that RED;
snapshots cannot be auto-discovered as tests. The original assertion remains in
the green model suite. `evidence/iac.json` records resource-free **N/A** after RED
and before implementation. Source/tool provenance and real-browser observations
include DOM, keyboard, errors, locked configuration, failure/unknown attribution,
history limits, exact reset, actual CSP probes, and awaited cleanup.
Raw streams, TAP and `.snapshot` files retain exact bytes across Git publication;
test-source fingerprints explicitly normalize CRLF to LF for portable comparison.
Owned Git attributes mark raw snapshots/TAP as binary so publication does not
normalize their CRLF bytes or mistake them for source whitespace errors.
The early focused reset-shadow test false positive and first browser probe-injection
harness failure are preserved, not reclassified as passes. Both were corrected;
the original behavioral RED assertion remains unchanged in the green suite.
`evidence/verification.json` summarizes the final 26 focused checks, one composite
real-browser check, and 27-test ordinary rerun with retained proof unchanged.

## Scope, refinement and honest limits

Only `learning\S050\**` is owned. This bounded mission needs no extra To Do
test/plumbing/refinement unit. B-S050 remains genuinely unready without CORE,
DATA, ASANY, C108, an approved qualified target and native observations; D-S050
is not completed by this model. Parent alone performs empirical acceptance.

This is not native TCP/keep-alive/routing-cookie proof, a live Azure result,
production Node.js 24 certification, or five-nines reliability evidence. No
cloud, IaC generation, scaffold, identity registration, deployment or spending is
authorized. All fixtures are synthetic and contain no credentials.

The [Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer)
applies: educational examples are provided “AS IS”; no Microsoft endorsement,
warranty, certification or SLA is implied.
