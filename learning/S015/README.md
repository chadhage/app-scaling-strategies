# S015 — Horizontal scale-in

**Training rehearsal - synthetic data - not a live Azure result**

A-S015 · parent D-S015 · frozen S / Kano unit A-S015 · packet SC-S015.
Open `index.html` directly in a modern browser. No server, account, framework,
package installation, management access, or network connection is required.

## Exact source and worked exercise

Canonical README.md S015 is **Horizontal scale-in**: use host-supported admission,
drain, or continuation mechanisms to preserve work before capacity terminates.
D-S015 adds active requests/jobs, original budgets, no unintended new work on
retired capacity, and no fabricated opaque-host behavior. Its original
prerequisites remain D-S041 and D-S076. The A contract asks to retire capacity
with active requests/jobs and distinguish safe continuation from lost work.

The deterministic fixture starts with **two compute instances**, retiring-A and
ready retained-B. A owns one request and one job admitted at tick 0. Request
duration is 2 ticks, job duration 4, original work budget 6, drain budget 5.
Retained-B has capacity for this exact fixture. These are teaching assumptions,
not observed native behavior, Azure limits, or universal drain guarantees.

1. **Drain:** start, close admission, probe, advance four times, retire safely,
   probe again, verify. Original work succeeds; actual synthetic capacity is 1.
2. **Continue:** reset, choose durable continuation, start, close, checkpoint,
   probe, advance twice, retire, probe, advance twice, verify. Only the job
   changes owner. It keeps its original deadline and one-effect ledger;
   the request finishes on A and the job finishes later on B.
3. Attempt early retirement: it is blocked without losing work. A requested
   closure or retirement is not the measured actual-capacity result.
4. Choose stale routing, missing checkpoint, missing completion, unobserved
   retirement, or an opaque host. Check the distinct FAIL/UNKNOWN results.
   Missing checkpoint proof cannot authorize transfer, but later directly
   observed completion can still permit ordinary drain.
5. Shorten drain budget to 3: work can succeed while the scale-in verifier fails
   and retains both instances. Shorten work budget to 3: late job completion is
   an interruption, even if its effect eventually occurs.
6. Explicitly confirm **Fault: terminate retiring-A now** while work is active:
   known active work is lost. Subsequent ticks do not repair that failure.
   For an opaque host even the fault cannot fabricate observed termination.

The original two-work denominator contains successful, failed, unknown, and
pending items. Probes are separately counted routing observations, not completed
journeys. The observed-work fraction includes unknowns and is withheld while
work is pending. No user-migration percentage or native reliability is claimed.
Known failure takes precedence over separate missing proof. Verifier, work
impact, and synthetic cleanup are always displayed separately.

## Guards, keyboard, reset, and history

Native labels, buttons, tables, live announcements, visible focus, Enter,
Space, Tab, and Shift+Tab support keyboard conducting. Invalid inputs have a
visible alert; they cannot admit work or leave a prior pass as the current
verification. Inputs are exact records, bounded integers, and supported enum
choices; no coercion of strings, booleans, fractions, non-finite values, or
extra fields. Issued states and all historical snapshots are immutable.

Time is bounded to 12 logical ticks, durations to 1–8, drain budget to 1–10,
work budget to 1–12, probes to 8, and action history to 48 per attempt. There
are at most four archived attempts plus the current attempt. Full archives
refuse a destructive reset rather than silently dropping failed history.

**Reset working rehearsal** restores the exact defaults, clears fault consent,
and archives the complete previous attempt, including failures and unknowns.
The normal `form.reset()` handler is not shadowed by control names or IDs.
Archives are in memory only. Explicit page reload clears the session; inspect
or copy the complete JSON first. There are no timers or background operations.

## Verification and retained provenance

Use the existing Node.js **22.23.4 test-tooling runtime only**:

```powershell
node --test --test-reporter=tap .\learning\S015\scale-in.test.cjs .\learning\S015\guards.test.cjs .\learning\S015\integrity.test.cjs
node --test --test-reporter=tap .\learning\S015\browser.test.cjs
node --check .\learning\S015\scale-in.js
node --check .\learning\S015\lesson.js
```

Ordinary tests never rewrite historical evidence. Intentional browser capture:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node --test --test-reporter=tap .\learning\S015\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

`evidence.json` indexes the BDD, loadable-stub RED (47 checks, 46 actual
assertion failures, one pass), exact source/test/stub snapshots, raw TAP,
subsequent implementation checks, and actual headless browser observations.
Snapshot names end in `.source.txt`, not auto-discovered test filenames.
Bundle-local `.gitattributes` preserves exact source and evidence bytes;
only raw TAP files are wholly exempt from whitespace linting. Syntax command
logs retain their original final separator line; only their blank-at-EOF check
is relaxed. Runtime/source whitespace validation remains enabled.
The first full integrity run (67 pass, one fail) is retained with its exact
test source: it incorrectly equated the Windows helper's CRLF bytes with
its published LF Git blob. The corrected check keeps the authorized exact
checkout hash pinned and separately verifies normalized content lineage.
No helper or application behavior changed for this test correction.
The first publisher attempt then stopped at its real Git whitespace gate before
commit: disabling blank-at-EOF requires Git's explicit `-blank-at-eof` token,
not merely omitting the positive token. Its failing gate output, policy/test
snapshots, and recovery provenance are retained; raw logs were not altered.

IaC: **N/A**, explicitly recorded after qualified RED and before implementation.
No IaC, scaffold, identity registration, cloud execution, deployment, or spend.

The browser runner checks the exact published `testing\browser\isolated.cjs`
from `53c0c0d`, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`.
It uses `openIsolatedLesson` and awaited `close()` in `finally`, with the existing
offline Playwright 1.56.1 and installed Microsoft-signed Edge 156 only. No
foreground lease, download, unsafe flag, framework, or dependency change occurs.
Successful per-feature UI checks **do not qualify the helper's blocked overall
lifecycle recovery**; the abandoned recovery prototype is not used.

## Refined remaining To Do — genuine gates and lineage

- **A-S015:** one implementation unit; parent-owned independent empirical review
  and acceptance remain. Tests, browser checks, and refinement earn no units.
- **B-S015:** native scope remains unimplemented and not ready without CORE,
  DATA, AKS, C075, C078, a qualified supported target/envelope, and separate
  execution/lease authorization. SOURCE alone does not satisfy those gates.
- **D-S015 roll-up:** remains incomplete. Both required A/B slices, original
  D-S041/D-S076 prerequisites, BASE (H011, P005, applicable HOST), actual work
  completion/continuation, budgets, routing and observed retirement must pass.
  An accepted portable A-S041 or checkpoint lesson does not complete a native
  source parent.
- **Production and statistics:** production Node.js 24, native Azure behavior,
  source-parent completion, and five-nines/statistical proof remain unclaimed.

This bundle reuses the established standalone-lesson, pure-state, evidence,
and isolated-browser patterns without editing closed or shared code. Its CSP
allows local external scripts/styles only and denies connections, inline script,
forms, frames, workers, objects, and other content. Rendering uses text, never
untrusted HTML. No credentials, storage, accounts, or management capabilities.

Microsoft open-source disclaimer: provided “AS IS” without warranty; consult
the repository's full disclaimer. This lesson is not a Microsoft SLA.
