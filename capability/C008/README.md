# C008 — preparation and limits

H002 · frozen **S** · one original unit `C008` · packet `LP-LEARN`.
Accepted **C003 + C005** are the consumed entry gates.

Open `index.html` directly in a browser with JavaScript. Choose any of the **150
scenarios and two workflows**, then **Open preparation**. Keyboard: use arrows
in the native selector, Tab to Open, then Enter. Opening focuses the entry
heading; the status announces it. **Reset local view** clears the selection and
revalidates the original shared artifacts. It never cleans up cloud resources.

This is local reading and preparation, not search (C006), filtering (C007), an
execution console, a new manifest registry, or completed H002/native/source
parents. No installation, server, framework, Azure access or credentials are
needed. [Microsoft disclaimer](../../README.md#microsoft-open-source-disclaimer).

## Three different preparation modes

- **Accepted synthetic practice:** eleven original lesson links from C005's
  historical snapshot. Read each lesson's own preconditions, synthetic inputs,
  controls, assertions and limitations. **Training rehearsal — synthetic data —
  not a live Azure result.**
- **Unavailable practice:** other scenarios do not have accepted learning in
  that snapshot, even if a file or later publication exists. The workflows have
  no portable A-card exercise; portable practice is unsupported here. Their
  source/preparation reading views still work. No replacement exercise, current
  availability claim or universal unsupported-host claim is invented.
- **Separately gated native prerequisites:** every entry remains not runnable,
  unqualified and source-parent incomplete. Source dependencies and acceptance
  are requirements, not proof that installed modules satisfy them.

The view shows exact per-entry source objectives, implementation requirements,
acceptance, prerequisites and pinned source-row links. All D-S scenarios retain
**BASE** even when additional prerequisites say `none`. Workflows retain their
own listed prerequisites; W002's CONTAINER alternative is not silently replaced
by the first planned App Service target. Original AND/OR rules, shared Done,
lifecycle/safety and evidence excerpts remain available with their source links.

## Reuse, not another authority

`preparation.js` delegates to C005's existing **1.0.0 validator**, which delegates
matrix checks to C003. It verifies the unchanged C001 artifact through C001's
existing cryptographic integrity guard. Ready views hold references to the
shared catalog, selected entry, matrix and approval artifact, not copied metadata
or approval tables. There is no extraction, filesystem/ledger discovery, JSON
import, new catalog or shared-file edit.

- Catalog: `capability\C005\catalog-data.js`, unchanged, immutable.
- Source/availability pin: `1583da90c1013ba95fdf268d6901f8a14bdf900a`.
  The shared commit time and ledger-update time are displayed. This is
  **historical snapshot availability, not live state**.
- Capability authority: unchanged C003 matrix and constraints. All 17
  configurations, exact reasons and exact constraints can be inspected; none is
  assigned to an entry. Documented-supported is not implemented or qualified.
- Approval authority: unchanged C001 approval artifact and guard. Design choices
  are not scaffold, identity-registration, IaC, deployment or spending consent.

Native OS, SKU, subscription, resource group and region are **unapproved**, not
defaults. Target/service/format applicability, tenant/app identity, scoped
permissions and a reviewed lease are not supplied. Pricing is unknown, not a
zero-dollar quote. Risk remains **unclassified**; priority does not classify risk.
Missing fixture/load/capacity/latency/readiness/job/drain/retention/dependency/fault
limits require a reviewed configuration-specific envelope.

The six missing operator approvals are individually visible. The immutable
envelope permits **0 live runs and 0 authorized cloud spend**. There are no
run/provision/deploy/approval controls. Native verification is unverified, actual
user impact unmeasured, and cloud cleanup unobserved. Reset is neither H010
cleanup nor evidence export; empty samples, health probes, configured routing
and module availability prove no native result.

## Checks and intentional evidence capture

```powershell
node --test --test-reporter=spec .\capability\C008\tests\preparation.test.cjs .\capability\C008\tests\surface.test.cjs
node --test --test-reporter=spec .\capability\C005\tests\catalog.test.cjs .\capability\C005\tests\surface.test.cjs
node --test --test-reporter=spec .\capability\C008\tests\browser.test.cjs
```

The shared C005 tests verify byte-reproducibility from its pinned git blobs,
source-row attribution and accepted-lesson ancestry without updating metadata.
`evidence\source-integrity.txt` also records equality with the accepted C005
publication and unchanged C001/C003 authorities.

**Whole-checkout parity is a separate, disclosed limitation.** C005's strict
`catalog-source.cjs --check` now rejects the later root README discoverability
additions in commit `79f404093c62bb19851b55c83967083940ca2371`.
`evidence\source-current-checkout-drift.txt` records the actual failure; it is
not reported green. The diff adds navigation/documentation, not scenario rows.
The historical pinned module remains reproducible and is deliberately unchanged.
C008 does not edit the root README, weaken C005's checker, refresh its pin or
claim that the snapshot represents the current checkout.

Ordinary browser verification **does not write or delete observations**. To
deliberately capture or refresh
`evidence\browser-observations.published-helper.json`:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try {
  node --test --test-reporter=spec .\capability\C008\tests\browser.test.cjs
} finally {
  Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue
}
```

Only the exact string `1` enables capture, and only after success and awaited
browser cleanup. A failed capture preserves prior observations. Both normal
capture-unset reruns and captures preserve the earlier
`evidence\browser-observations.json` byte-for-byte. Independent reruns and
maintenance earn no additional value credit.

### Final browser provenance gate

The final test verifies the helper's exact SHA256 **before importing it**:
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
It also compares the source with published commit
`53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, checks the hash again after awaited
cleanup, and verifies that the abandoned `lifecycle.cjs` dependency was not
imported. No shared helper or tooling files are edited by C008.

An earlier browser attempt imported experimental helper SHA
`ee69b2fe04d846f065758326407f424d4d74c64d717c3bbe72983cca66ff4e01`.
Its raw `browser-iteration-2-failure.txt` remains **historical and unqualified**;
`prototype-browser-history.json` explains the chronology without reconstructing
an overwritten uncommitted observation file. The lifecycle-recovery prototype
is **not qualified, active or shipped**.

The original committed `browser-observations.json` already records the
published `86c80...` helper after a later intentional capture. It and its
associated earlier logs are unchanged; they are not falsely relabeled as
prototype observations. The new final actual all-152 DOM/keyboard/empty/error/
reset/CSP pass actively enforces the published provenance gate and is recorded
separately in `browser-observations.published-helper.json` and
`provenance-browser-green.txt`, with published provenance and awaited cleanup.
`provenance-red.txt` preserves the real missing-gate assertion failure before
the test was corrected. `provenance-browser-rerun.txt` records a successful
capture-unset run with both proof files' SHA256 values unchanged.

`evidence.json` records BDD → loadable stub → **three genuine behavioral RED
assertions** → IaC N/A → implementation/refinement → focused GREEN/syntax/shared
source integrity → actual headless browser checks. Original failing sources end
in `.txt`, so normal Node test discovery cannot run them.

Browser tests use only existing `testing\browser\isolated.cjs` /
`openIsolatedLesson`, offline Playwright **1.56.1**, signed installed **Edge
156.0.4314.50**, and Node.js **22.23.4** test tooling. They await `close()` in
`finally`. No package install, browser download, foreground lease, unsafe flag or
root/package/framework change is involved. Production Node.js **24** remains
unvalidated. The final helper's exact published provenance is enforced and
recorded; earlier prototype attempts remain historical, not qualified.

Actual browser checks cover all 152 rendered preparations, canonical source and
prerequisite/evidence text, every unchanged matrix reason/constraint, keyboard
focus/open/lesson navigation/reset, empty/error clearing, stale-async-result
rejection, literal text, 320px reflow, and genuinely denied inline/connection CSP
probes. These are focused observations, **not full WCAG/assistive-technology
certification**, a backend authorization service or native reliability proof.

## Relevant remaining work / To Do refinement

These are refinements of original lineage, not new admissions, units, claims of
current board state or extra completion credit. C008 changes only its namespace;
the controller owns live-ledger acceptance and queue changes.

| Original lineage | Remaining behavior and real boundary |
| --- | --- |
| H002 → C006 / C007 | Retain their own search/filter acceptance and accepted C003+C005 gates. C008 supplies neither. No hidden native release gate is added to their local work. Risk stays unclassified unless separately reviewed, never inferred from priority. |
| H002 → C005 maintenance | Any availability refresh needs a deliberately reviewed committed acceptance/publication snapshot and C005-owned regeneration/checks. The strict whole-checkout check currently flags later README documentation commit `79f4040`; its owner must review that parity boundary before claiming current-source equality. File presence and C008 results cannot update the historical snapshot. Maintenance is the same unit, not a new S credit. |
| Original remaining A-S entries | A preparation reading view is not a worked portable exercise. Any unfinished A card still needs its own synthetic behavior, focused tests/browser evidence and independent acceptance. Its SOURCE gate remains resource-free; native approvals are not a prerequisite for local lessons. |
| Original B-S / D-S / W001 / W002 | Native proof and source-parent acceptance remain separate. Concrete OS/SKU/subscription/RG/region and separate execution/IaC/scaffold/identity/deployment/spend approvals are absent. Retain each entry's exact C005 source prerequisites and its original card gates; obtain the reviewed lease, applicable adapter/fixture, operating envelope, client evidence and cleanup proof rather than counting a module as readiness. W002 must retain its shared ACA/AKS requirement. |
| H002 parent / H011 / H012 | This local view supplies no production hosting, manifest/execution path, authenticated leases, production Node.js 24 validation, complete accessibility audit or native recovery/cleanup evidence. Those original acceptance requirements remain unfulfilled by C008. |

Worker publication is not Done. The worker reports actual publication through
`state.ps1 -Action Report`; only controller empirical review can accept C008.
