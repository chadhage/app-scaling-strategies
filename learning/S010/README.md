# S010 — Cohort feature-flag rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a modern browser. There is no server, dependency,
credential, login, resource, storage service, deployment, or spend.

## Contract

- **Card / parent / source:** A-S010 / D-S010 / README.md S010.
- **Kano:** one frozen S unit, A-S010; packet LP-LEARN; SOURCE entry gate.
- **Objective:** enable behavior for a stable cohort and reverse it while checking
  existing sessions, cart data, configuration compatibility, and retained failures.
- **Precondition:** compatible code is already in one synthetic deployment.
  Its reader supports configuration v1 and state v1; v2 is a deliberate mismatch
  fixture, not a supported upgrade.
- **Inputs:** explicit synthetic events, four fixed sessions (two pilot, two
  control), config v1/v2, state v1/v2, and at most 60 events per run.
- **Trace:** ordered event numbers, requested versus applied configuration,
  compatibility decisions, per-session behavior, data effects, and deployment ID.
  No clock, randomness, real users, or observed Azure telemetry is involved.
- **Assertions:** baseline observation, selected-cohort-only activation,
  post-reversal observation, constant deployment identity, session/data
  continuity, and no interrupted attempts. A guarded publication is distinguished
  from an uninterrupted exercise.

## Worked exercise

1. Select **Observe all four journeys** while the flag is off.
2. Leave **pilot** and **v1** selected; choose **Enable feature by cohort**.
3. Observe again: pilot uses enhanced behavior; control stays standard.
4. Choose **Revert flag to off**, then observe again. All sessions use standard
   behavior. The same synthetic code/deployment and cart identifiers remain.
5. A **PASS** means this deterministic synthetic flag exercise passed. It does
   not mean that users migrated between deployments.

Try config v2 to see publication blocked without exposure. Or inject state v2
for pilot-1 after enabling, observe, reverse, and observe again. The interrupted
session remains incompatible even with the feature off. Restoring the v1
synthetic fixture allows later reads; it does not erase earlier interruptions or
pretend to implement a real schema downgrade.

Use the JSON editor for explicit events. For example:

```json
{"type":"publish-flag","cohort":"pilot","enabled":true,"configVersion":1}
```

Other admitted events are `{"type":"observe"}`, `{"type":"revert-flag"}`, and
`{"type":"set-state-version","clientId":"pilot-1","stateVersion":2}`. Cohorts are
`pilot`/`control`; clients are `pilot-1`, `pilot-2`, `control-1`, `control-2`.
Types are strict, extra fields are rejected, and unknown operations fail rather
than falling back to success. Reset starts a fresh run and visibly archives the
previous trace/verdict for this page session. Closing/reloading the page loses
in-memory results; copy the evidence JSON first if it matters.

## Verification and evidence

Run from the repository root with the approved **Node.js 22 test tooling**:

```powershell
node learning\S010\tests\capture.cjs green
node learning\S010\tests\capture.cjs browser
node learning\S010\tests\capture.cjs syntax
node learning\S010\tests\capture.cjs integrity
```

`specification.feature` precedes a loadable no-op stub and genuine behavioral
red. `evidence\red.stub.cjs`, `red.log`, and `red.json` retain that first
implementation, raw TAP, source hashes, timing, and actual failing exit status.
The red suite is not a missing-module or parser failure. `iac-na.json` explicitly
records the resource-free IaC step after red and before implementation.
Corresponding green/browser/syntax/integrity logs and JSON records preserve
actual commands, hashes, runtime, counts, and outcomes. Browser checks use only
the shared verified `testing\browser\isolated.cjs`: offline pinned Playwright
1.56.1 and installed headless Edge, with sandbox/security defaults preserved.
The browser is closed in `finally`; no integrated browser is used.

Recorded results: the loadable stub had **2 passes / 63 assertion failures** in
65 tests. The implemented engine passes the same **65 behavioral tests**.
Actual Edge **156.0.4314.50** with Playwright **1.56.1** passes **14 browser leaf
checks** (15 Node test results including their wrapper); **14 integrity checks**
and **7 executable syntax checks** pass separately. See the raw logs/JSON, not
these counts alone.

The first actual browser run exposed a 438-pixel document at a 390-pixel viewport.
`browser-1.json`, `browser.log`, `browser-1-observations.json`, and
`layout-before.json` retain that failure. Fixing the fieldset's default
`min-content` width made the unchanged responsive assertion pass. Subsequent
captures preserve earlier records and raw logs rather than hiding failed
attempts. Scoped `.gitattributes` preserves exact artifact/source bytes even
when the repository uses automatic CRLF conversion. Its `cr-at-eol` whitespace
rule accepts legitimate Windows line endings while retaining the other default
code whitespace checks. Only raw evidence logs also allow their intentional TAP
indentation on otherwise blank lines. The first publication preflight rejected
those exact CRLF bytes and raw-log blank-line indentation;
`publication-preflight-1.log`/`.json` retain the actual rejection before any
commit, tag, or push. No raw artifact was rewritten to evade that check.
`provenance.json` hashes
the delivered bundle; the ignored `evidence\result.json` is a post-publication
receipt carrying the actual commit/tag and is also retained by the Report ledger.

Node.js 24 production support is **unvalidated**. No packages, frameworks,
downloads, IaC, native tests, Azure credentials, identity registrations, resources,
or management calls are included. B-S010 and the original source-parent native
acceptance remain unfulfilled. Flags are not an authentication boundary and do
not prove deployment migration, availability, or a service-level objective.

## To Do refinement (no additional credit)

- B-S010 remains gated by CORE, DATA, HOST and explicit native authorization.
  Preserve unchanged deployment identity, ongoing journey/state evidence, and
  pre-reversal failures in a future qualified native flag experiment.
- D-S059 is separate: mixed-version configuration readers need their own
  compatibility matrix; this lesson's fixed reader is not that proof.
- The proposed production Node 24 runtime and any hosting integration require
  separate validation/approval. No follow-on card is admitted by this lesson.

## Microsoft Open Source Disclaimer

The examples and guidance are provided "AS IS" for educational and demonstration
purposes without warranties or guarantees, except as required by applicable law
or binding terms. Validate security, reliability, compatibility, and cost before
production use. References to Microsoft and Azure do not imply endorsement,
sponsorship, certification, or support. Project goals are not Microsoft SLAs.
Microsoft and Azure are trademarks of the Microsoft group of companies. This
disclaimer grants no license or redistribution rights and changes no applicable
license, product terms, support agreement, or published SLA. See the full
Microsoft Open Source Disclaimer section in the repository's `..\..\README.md`.
