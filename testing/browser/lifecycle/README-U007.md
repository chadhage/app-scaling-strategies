# U007: bounded cleanup of invocation-owned scratch

Local Windows / Node 22 lifecycle tooling, zero Kano credit. The new entry points
are opt-in; `isolated.cjs`, the accepted U004-U006 modules, their READMEs, imports
and historical evidence are not changed.

## Integration and ownership

`scratch.cjs` creates an opaque, invocation-bound owner. Its `mkdir()` calls the
filesystem's exclusive, non-recursive creation operation before recording the
root's identity and the identities of its ancestors. Creation failure grants no
ownership. An unreadable creation identity retains the original mkdir outcome but
refuses later removal.

`scratch-session.cjs` composes that owner with the unchanged U005/U006 session.
`startScratchSession()`, `openLessonScratchSession()` and
`openLoopbackScratchSession()` use an invocation-local `AsyncLocalStorage`
observer around successful mkdir. Overlapping observers are reference-counted;
unrelated callers are not observed. Existing sessions cannot be rebound to
another owner. No directory difference, prefix, error message or `error.path`
authorizes deletion.

```js
const { openLessonScratchSession } = require('./scratch-session.cjs');
const session = await openLessonScratchSession(
  'testing\\browser\\fixtures\\counter.html', { deadlineMs: 60000 }
);
try {
  await session.page.title();
} finally {
  await session.close();
}
```

The wrapper preserves the original U006 process report and close error. It
requests scratch cleanup only after a confirmed process end state and settled
sealed I/O. An abandoned open remains non-clean even if a later close succeeds.
The default maximum is the unchanged U006 close bound plus 2000 ms of scratch
budget: 184000 ms, tested on the virtual clock. Caller-supplied startup and close
budgets retain U005/U006 semantics.

## Cleanup contract and measured limits

- One exclusively created direct-child root per owner; a second root is refused.
- Defaults: 4 attempts, one 2000 ms budget, backoff 25/50/100 ms, each capped by
  the remaining original budget. Configured limits are at most 16 attempts,
  256 enumerated paths, depth 16 and 1024 path characters.
- Only EBUSY, EPERM and ENOTEMPTY are retry candidates. Other failures are
  reported without another attempt.
- Root and ancestor identities are rechecked before destructive attempts.
  Links, changed identities, malformed listings, device names, alternate data
  streams, trailing dots/spaces, traversal and over-limit scans refuse removal.
- Every awaited cleanup operation is raced by the core against the original
  budget. Cancellation or expiry stops new attempts; issued I/O is not undone.
- A fresh observation, not the removal adapter's claim, decides absence.
  Reports retain attempts, delays, failures, remaining paths and uncertainty.
- Pure cleanup outcomes and close-error outcomes are frozen copies. Browser
  pages and the existing mutable process-tree handle are intentionally handles,
  not pure model outputs.

Named behavioral coverage is in `U007.feature` and `tests\u007-*.test.cjs`.
S001-S003 measure exact virtual attempt times. S004/S011 cover every cleanup
await, deadline equality and cancellation. S007-S010 cover ownership, Windows
path rules, a real junction, hostile shapes and the strict-mode object walker.
S009 also runs 64 actual owned-file scopes in eight-way waves. S012 exercises
unchanged U005/U006 composition, FIFO/LIFO, a failed/abandoned opener and a late
close while another session stays usable.

R001/R002 use a real Windows FileStream that denies delete sharing (R002 uses
FileShare.None). Held, release and process-exit acknowledgements are barriers;
no elapsed-time assertion decides the result. The original one-attempt control
fails the same assertions before implementation and passes neither recovery nor
the four-attempt requirement.

## Commands

Run from the repository root; `<SCRATCH>` is a caller-owned private directory.
Each `--work` child below must not exist yet. Set TEMP, TMP and TMPDIR to that
owned child in the recorder specification for coverage captures.

```powershell
# Replay the original behavioral RED against its retained loadable control.
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\red --implementation one-attempt --test --test-concurrency=1 --test-timeout=300000 testing\browser\lifecycle\tests\u007-scratch.test.cjs testing\browser\lifecycle\tests\u007-session.test.cjs testing\browser\lifecycle\tests\u007-windows-lock.test.cjs

# GREEN (including the unchanged RED tests, not a weakened substitute).
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\green --implementation candidate --test --test-concurrency=1 --test-timeout=300000 testing\browser\lifecycle\tests\u007-api.test.cjs testing\browser\lifecycle\tests\u007-scratch.test.cjs testing\browser\lifecycle\tests\u007-safety.test.cjs testing\browser\lifecycle\tests\u007-session.test.cjs testing\browser\lifecycle\tests\u007-integration.test.cjs testing\browser\lifecycle\tests\u007-more.test.cjs testing\browser\lifecycle\tests\u007-windows-lock.test.cjs

# One independent 85/85/85 command per full production file; <tests> is the GREEN list above.
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\coverage-scratch --implementation candidate --test --experimental-test-coverage --test-coverage-include=<REPO>\testing\browser\lifecycle\scratch.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=300000 <tests>
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\coverage-session --implementation candidate --test --experimental-test-coverage --test-coverage-include=<REPO>\testing\browser\lifecycle\scratch-session.cjs --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 --test-concurrency=1 --test-timeout=300000 <tests>

# AST + accepted-lexer mutation, one or two normal workers under the shared mutation slots.
node --expose-internals testing\browser\lifecycle\tests\u007-mutate.cjs --work <SCRATCH>\mutations --jobs 2
```

Use the existing `<RUN>\scripts\archive-run.cjs` for RED, GREEN, coverage and
mutation captures. Original raw streams, manifests and input hashes remain
immutable in private storage. Public derivatives, when present, have separate
hashes and an explicit origin relation; they are not described as raw originals.

## Limits and current qualification boundary

Trusted filesystem/clock/opener functions can execute arbitrary synchronous
JavaScript; timers cannot preempt that. The checked path operations do not
provide a kernel-atomic directory-handle transaction against a malicious
same-user actor changing paths between verification and removal. No such
adversarial-OS guarantee is claimed.

Over-limit/unreadable scans name the root and record unconfirmed enumeration,
not a complete list of unseen files. Playwright profiles not positively recorded
by this mkdir observer are not adopted or deleted. Historical U004-U006 evidence
and any pre-existing fresh-checkout integrity failures remain historical.

The first Windows capture failed at script execution policy before holding a
file; it is retained but is not qualifying RED. The corrected fixture uses the
accepted encoded-command pattern without changing execution policy.

Actual Edge qualification, U034 reader completion, live application, publication
and acceptance are separate gates. Hermetic loader fixtures are not real-browser
evidence. The private result lists uncompleted gates and mutation survivors;
this README does not award Done or qualify a browser.
