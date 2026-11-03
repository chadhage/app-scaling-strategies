# A-S033 — worker-affinity removal

**Training rehearsal - synthetic data - not a live Azure result**

Open `learning\S033\index.html` directly in a browser. No server, package installation,
credentials or Azure account is needed. This is one frozen S unit in SC-S033, implementing
the portable A-card exercise for README S033 and backlog D-S033, not native B-S033.

## Conduct the comparison

1. Probe the initial affinity-on/local-state fixture: 4/4 matching requests on worker-a.
   This baseline does **not** make removal safe.
2. Try removing affinity first: an explicit failure safely aborts before exposure,
   retaining both local records and affinity on.
3. Preview the unsafe off/local order: four HTTP 200s include two failed state checks
   on worker-b. The counterexample does not change current routing or storage.
4. Externalize with complete matching receipts for both clients. Probe shared state
   while still pinned, remove affinity, then probe again: 4/4 matches across both workers.
5. Inject one wrong revision or missing observation. Mismatches fail; absence is unknown.
   Failed/unknown migration evidence never commits shared state or authorizes removal.
   Probe faults are observations, not mutations of stored records.

Guard checks, migration records and request probes use separately labeled units.
The verifier result and user impact are separate: a blocked action is a safe abort;
the unsafe preview shows hypothetical interruption, not an applied change.
Later success never removes older failures/unknowns. Expand history to inspect each
trace. At 16 steps the run stops without dropping records.

Tab, Shift+Tab, arrow keys and Enter/Space operate the native controls and history.
Reset intentionally clears history and returns focus to “Next action” in a new,
untested local/affinity-on run. It is not a migration or repair. `form.reset` is not
shadowed. Reload also loses this in-memory run.

## Focused verification

Use the existing Node 22 test tooling from the repository root:

```powershell
node --test --test-reporter=tap .\learning\S033\tests\affinity.test.cjs .\learning\S033\tests\surface.test.cjs .\learning\S033\tests\evidence.test.cjs
node .\learning\S033\tests\browser.cjs
```

Ordinary commands are read-only to the lesson and its published proof. The browser
runner verifies that every owned file hash is unchanged. It uses only the published
`testing\browser\isolated.cjs` SHA-256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`,
`openIsolatedLesson`, existing offline Playwright 1.56.1, and installed signed Edge 156.
It awaits `close()` in `finally`; it does not use a foreground lease, download,
unsafe browser flag, or the abandoned lifecycle prototype. The shared helper's
documented lifecycle limitation remains; this is not unattended-runner certification.

Only a deliberate evidence refresh may set `CAPTURE_BROWSER_EVIDENCE=1`.
It creates a new numbered `evidence\browser-NNN.json` rather than overwriting history.
Review its result and source pins before deliberately updating the evidence summary.
No ordinary verification refreshes that summary.

`affinity-removal.feature` preceded the loadable stub and genuine assertion RED.
The original RED's assertion expected `success` and received `unknown`; no missing
tool/module or syntax failure is counted. `evidence\red.raw.json` preserves exact
stdout/stderr bytes as base64 with hashes. Human-readable `.txt` logs only normalize
line endings/trailing whitespace. Archived stub, test and BDD snapshots end in `.txt`
so test discovery cannot execute a deliberately failing snapshot.

Explicit RED replay (expected exit 1):

```powershell
node --test --test-reporter=tap .\learning\S033\tests\replay-red.cjs
```

IaC was recorded N/A after RED and before implementation. Source pins, immutable
proof pins, command provenance, focused green/syntax checks and actual DOM, keyboard,
error/reset, failure and CSP observations are linked from `evidence.json`.
Owned attributes preserve LF source and exact evidence bytes across checkout.
The first actual browser attempt is retained as a failed test-method observation:
DevTools evaluation bypassed the page's eval restriction. It is not qualifying CSP
proof. The corrected probe loads an allowed local external author script and tests
eval there; no page policy, sandbox or helper was weakened.

## Limits

This deterministic two-client/two-worker model assumes compatible readers and atomic
externalization. One JavaScript map does not prove durability, concurrent-write safety,
real cookies, authentication, actual routing or Azure support. It concerns worker
affinity, not slot-routing-cookie transition. There are no management calls, browser
persistence, cloud resources, generated IaC, identities, deployment, expenditure,
new packages or frameworks. The test tools do not certify production Node.js 24.
Native B-S033 and full D-S033 remain uncompleted; only the parent may accept this card
and award its single Kano unit.
