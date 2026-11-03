# S044 — Resume the original download

**Training rehearsal - synthetic data - not a live Azure result**

A-S044 · parent D-S044 · frozen satisfier S · packet SC-S044 · `worker-A-S044`.

Open `index.html` directly in a modern browser. No server, account, installation,
credentials or cloud connection is needed. The portable contract is in
`manifest.json`; `range-resume.feature` is the BDD specification.

## Worked exercise

The original artifact is exactly 32 synthetic bytes, values 0–31. Its SHA-256 is
`630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd`;
its synthetic validator is `"s044-artifact-v1"`, not a credential.

1. Keep the defaults: 12 retained bytes, correct range, 10 ms resume delay,
   100 ms original budget, observed checksum. **Admit prefix and cut over**,
   then **Resume & verify**.
2. The trace retains offsets 0–11 from v1 and requests `Range: bytes=12-`
   with the original validator from synthetic v2. The 206 receipt contains
   offsets 12–31. All 32 assembled bytes occur exactly once in order and their
   actual Web Crypto SHA-256 equals the original. Completion at 70 ms passes.
3. Reset and choose **skip one byte**: the successful 206 starts at 13,
   offset 12 is missing, assembled size is 31, and the verifier is FAIL.
   **Overlap one byte** instead duplicates offset 11 and assembles 33 bytes.
4. **Change one byte** preserves size and coverage but fails the real checksum.
   **Range unsupported / ignored** returns 200: unsafe append is refused and
   unsupported resumption is an interruption, never a successful continuation.
5. Deliberately missing final checksum evidence yields UNKNOWN, not success.
   A known gap or budget breach still yields FAIL with that check unknown.
6. With a 100 ms original budget, delay 40 passes exactly at 100 ms; delay 41
   fails at 101 ms. The resumed transfer's 20 ms clock cannot replace the
   original journey clock starting at 0.
7. Reset restores exact defaults and prefix focus while retaining receipts and
   traces for the newest eight outcomes. An unfinished admitted prefix becomes
   an UNKNOWN cancellation. Page reload clears this session-only history.

All clocks are deterministic assumptions: admission 0 ms, retained prefix 30 ms,
cutover 40 ms, resume at `40 + delay`, observation at `60 + delay`. Nothing waits
for those times; this toy is not a large-file throughput or network benchmark.

## Guards and keyboard operation

Inputs are exact enums and integers: prefix 4–28 bytes, delay 0–1000 ms, original
budget 1–1000 ms. Empty, coerced, fractional, non-finite, extra-field and forged
inputs are rejected. Admission locks the original configuration. Resume requires
an admitted prefix; repeated admission/resume and reset during verification are
rejected. Private state and returned receipts are immutable.

Tab visits each labelled control, admission, resume and reset; Enter activates
buttons and native select arrow keys choose conditions. Admission focuses resume,
completion focuses the result, and Reset focuses the restored prefix. Alerts
receive focus on rejected input. Reset is an ordinary button handler, not a
shadowed `form.reset` method. Failure history is never reclassified as success.
Verifier, user impact and in-memory cleanup are shown separately.

## Focused checks

Use the existing Node.js **22.23.4 test tooling**, offline Playwright **1.56.1**
and signed installed **Edge 156** only:

```powershell
node --test --test-reporter=tap .\learning\S044\tests\core.test.cjs .\learning\S044\tests\surface.test.cjs .\learning\S044\tests\integrity.test.cjs .\learning\S044\tests\browser.test.cjs
node --check .\learning\S044\range-resume.js
node --check .\learning\S044\app.js
```

Normal verification reads recorded proof without rewriting it. To deliberately
replace browser evidence only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
node .\learning\S044\capture.cjs browser
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

After an intentional recapture, review the new raw result and explicitly refresh
its content seal with `node .\learning\S044\capture.cjs seal`. Normal tests never
recapture proof or refresh the seal.

The browser suite uses only the published `testing\browser\isolated.cjs`,
SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`
at `53c0c0d82cc1db6780a87ac2b1085734af6d5c60`, calls
`openIsolatedLesson`, and awaits `close()` in `finally`. It never uses the
abandoned lifecycle prototype, an integrated-browser foreground lease, downloads
or unsafe browser flags. The shared helper's documented unattended shutdown
limitation remains; this lesson does not certify that runner.

`evidence/stub.raw.json` and `red.raw.json` retain verbatim output, base64 bytes,
byte hashes, commands, runtime and timestamps. The loadable stub produced
**13 genuine assertion failures and one passing API-load check**, exit 1, before
implementation; there were no missing-code/tool/import failures. Exact stub,
BDD and assertion snapshots end in `.snapshot`, so test discovery cannot run
historical RED code. The IaC N/A decision follows RED. Green, syntax, real DOM
observations and integrity records are linked by `evidence.json`.

The bundle disables Git text conversion so exact byte hashes and original RED
snapshots survive checkout. Its scoped whitespace policy recognizes CRLF while
retaining blank-at-EOL/EOF and space-before-tab checks. A post-publication blob check caught 18 CRLF-to-LF
changes in the initial commit. `committed-before-recovery.json` and the
`*.pre-publication.*` records preserve that actual failed integrity check and
earlier worktree-only proof. The same A-S044 unit corrects byte preservation
through a normal scoped follow-up commit, not an amended or force-pushed history.
Final publication is qualified only after committed blobs match the sealed hashes.

The three `browser.failed-attempt-*.raw.json` records are retained, not counted
as behavioral RED or successful browser proof: a Windows PowerShell 5 signature
module failure (the explicitly selected installed PowerShell 7 succeeds), an
overly short capture deadline, and an invalid Playwright fieldset assertion
(replaced by the native `disabled` property plus actual disabled child input).
No cleanup success is inferred from the timed-out attempt. The final successful
capture and independent verification both await their own session's close.

## Scope and limits

This is one portable A-card unit, not native HTTP, Azure, user-migration,
five-nines or production Node.js 24 certification. The 32-byte fixture models
the correctness contract only. Actual HTTP support, durable artifact access,
routing, UX and large-file completion remain unknown. CSP forbids connections,
inline scripts, forms, workers and embedded resources; data is rendered as text.
There is no persistent storage, server, real authentication or registration.

IaC is **N/A**. No shared/root changes, cloud operations, deployment, expenditure,
package/framework changes or resources are part of this lesson.

Native B-S044 remains gated by CORE, DATA, HOST, OBJECT, C025, an approved target,
original-artifact oracle and separately authorized lease. D-S044 also retains its
D-S039 dependency and original acceptance. Do not duplicate those remainders as
new test/plumbing/refinement units. The parent alone may empirically Accept
A-S044 once; this worker awards no Done credit.
