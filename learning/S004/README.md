# A-S004: Hold the experiment, then converge

Open `index.html` directly in a modern browser. No server, install, framework,
cloud connection or credentials are required.

**Training rehearsal - synthetic data - not a live Azure result**

## Worked path

1. Keep **Stable cohorts / compatible state** and hold three rounds.
   Inspect ten observed users on v1 and ten on v2. Both versions spend one
   credit and issue one ticket per operation, even though each operation is retried.
2. Hold again, or try twelve rounds. The split remains an experiment, not evidence
   that all users migrated.
3. **Request convergence to v2**. Desired routing becomes 100%, but the previous
   10/10 observations do not change. The new outcome is unknown.
4. **Observe convergence**. Only this new synthetic sample can demonstrate all
   twenty fixture users on v2 with equivalent state and exactly-once effects.
5. Reset and try **Unstable per-request assignment**, **Incompatible v2 state**,
   or **Missing observation**. Inspect the failed/unknown history and blocked
   convergence. A later passing sample never erases a prior adverse outcome.
6. For a route-negative exercise, first hold a healthy split, request convergence,
   then select **Lagging route** and observe. Desired 100% still has one user on v1.

The fixture intentionally uses evenly spaced, fixed buckets. Real 50/50 routing
does not guarantee an exactly balanced finite observed sample. The UI distinguishes
configuration, intended assignment, observed destinations, verifier result and
user impact. One round is a simulated minute, not a measured soak or reliability test.
After a missing observation the next sample may expose a state gap; the original
unknown result stays in history.

## Validation

From the repository root:

```powershell
node --test --test-reporter=tap learning\S004\experiment.test.cjs learning\S004\bundle.test.cjs
node --check learning\S004\experiment.js
node --check learning\S004\lesson.js
```

`experiment.feature` preceded the loadable no-op behavior stub and the genuine
24-failure red run. `evidence\behavior-stub.js.txt` preserves that stub.
Actual red/green output and separately observed real-browser results are referenced
by `evidence.json`. Node 22 is test tooling only; it is not the proposed production
runtime. No mock DOM test substitutes for browser evidence.

## Limits and cleanup

IaC is **N/A**. C001 approves design/local implementation, not cloud traffic,
IaC generation, identity registration, hosting changes or expenditure. This
portable lesson does not require Express. There are no management/network calls,
persistent browser storage, timers, credentials or resources to delete.

Reset clears only in-memory state, restores defaults and returns keyboard focus
to the rounds input. It starts a separate rehearsal; normal observations never
delete previous failed/unknown outcomes. The local trace is capped at 100 rounds.
This bundle proves neither B-S004 native behavior, full D-S004 acceptance, real-user
migration, Azure readiness, version retirement nor a reliability guarantee.
