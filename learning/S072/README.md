# S072 — Cold-cache refill comparison

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly in a browser. No server, packages, account, credentials, or network access is needed.
This is one portable A-S072 satisfier in SC-S072, owned by worker-A-S072. Its frozen Kano unit is A-S072/S.

## Exact source and acceptance

- README S072: **Cache stampede after cutover:** Coalesce or limit refill work so cold caches do not overload the database.
- D-S072: Add cold-cache burst and coalesced/bounded refill comparison controls.
- Exact parent acceptance: **Refill strategy is evidenced by data-tier load and journey latency; stampede-induced failures stay counted.**
- A-S072: **Compare unbounded and coalesced refill; identify a database-overloading stampede.**
- SOURCE gate: the supplied backlog and portable lesson contract. Preconditions, actions, trace, assertions,
  keyboard operation, honest outcomes, and limits are implemented in this bundle.

`evidence\source-contract.json` pins the source commit. `evidence\raw\source\` preserves both original working
bytes (including CRLF) and canonical Git-source selections of the exact source rows, acceptance section,
atomic/portable contract, SOURCE gate, and native sibling. The captured claimed-card record establishes
SC-S072, frozen class, and authorization. Source verification checks canonical Git bytes independently;
line-ending normalization is used only when comparing semantic agreement with the working copy.

## Worked exercise

All arrivals are at virtual time zero; requests use keys round-robin. The database accepts up to its fixed
concurrent capacity. An excess refill is rejected immediately at 0 ms. No failure retries or budget resets occur.

| Action / configuration | Database evidence | Journey evidence |
| --- | --- | --- |
| Defaults: unbounded, 8 requests, 1 key, capacity 2, refill 40 ms, budget 100 ms | 8 attempts; peak accepted 2; 6 overload rejections | 2 success, 6 failure, maximum observed 40 ms |
| Change only strategy to coalesced | 1 shared refill; peak 1; no rejection | 8 success at 40 ms; earlier 6 failures remain in history |
| Coalesced, 8 requests, 4 keys, capacity 2 | 4 attempts; 2 rejected | 4 success, 4 failure |
| Bounded + coalesced, 4 keys, limit 1, budget 80 ms | 4 refills, peak 1, no rejection; starts 0/40/80/120 ms | 4 success, 4 latency failures; maximum 160 ms |
| Raise that limit to 2 | Peak 2, no rejection | 8 success, maximum 80 ms (inclusive budget) |
| Coalesced, 1 key, withhold one observation | 1 refill | 7 success, 1 unknown; denominator remains 8 |

Unbounded starts one refill per request. Coalesced starts one per key, with all keys starting together.
Bounded mode also coalesces but queues distinct keys FIFO. With fixed service time `T` and safe concurrency
limit `L`, key index `i` starts at `floor(i/L) * T` and finishes one `T` later. The bounded limit must not exceed
database capacity; invalid bounds are rejected, not silently clamped. Bounded queue delay counts in the original
journey latency because every journey began at time zero. These arithmetic rules do not execute real concurrency.

A journey is a failure for overload or a completion beyond its original budget. Otherwise it succeeds only
with complete synthetic latency evidence. The missing-observation control withholds the final otherwise-successful
journey's latency; known failures cannot be erased by that control. A result containing any failure is `failure`,
otherwise any unknown makes it `unknown`, otherwise it is `success`. No measured latency yields `Unknown`, not zero.
An expected negative experiment can pass its tests while reporting failed users.

## Guards, history, and keyboard

- Six numeric fields accept only bounded whole decimal integers. Unknown enums/extra model fields, key/request
  inconsistencies, fabricated or stale sessions, and unsafe bounded limits are rejected without changing history.
- Results/configurations are immutable. Each run starts cold; editing controls alone cannot rewrite recorded results.
  At most 12 runs and 24 journeys per run are admitted. At the history cap, Run is disabled and the model also refuses
  extra submissions. Nothing is silently evicted. Session totals include failed and unknown attempted journeys.
- Tab through labeled native controls; Enter runs the burst. Errors are announced, focus the offending control,
  and preserve results. Space/Enter on **Reset lesson** restores defaults, clears this in-memory session, and focuses
  strategy. The reset button is deliberately not named or identified `reset`, so `form.reset()` stays callable.
- History lasts for this page session only. Reload or explicit Reset clears it; there is no persistence claim.
- Strict CSP allows only local scripts/styles and blocks connections, inline script, forms, frames, workers, and objects.
  Rendering uses text nodes, not HTML interpolation.

## BDD, genuine RED, and IaC N/A

`refill.feature` preceded the loadable model stub and focused test. The actual `red-model` run exited 1 with
`ERR_ASSERTION`, **actual 0 / expected 8** database attempts; it was not a missing module/tool failure.
Original stub, test, BDD, and attributes are preserved under `evidence\red\` with `.snapshot` suffixes so normal
test discovery cannot execute historical RED code. Raw stdout/stderr, exit status, exact argv, timestamps, and
pre-run source hashes are in `evidence\raw\commands\`.

**IaC: N/A.** This resource-free synthetic lesson requires no infrastructure, scaffold, identity, cloud call,
deployment, or expenditure. The source-gate declaration and explicit post-RED N/A record are retained.
Implementation/refactoring followed the behavioral RED; focused GREEN, syntax, integrity, and actual browser checks
are recorded separately. Test/plumbing/refinement work earns no additional Kano credit.

## Verify without changing evidence

From the repository root, using the existing Node.js 22 tooling:

```powershell
node .\learning\S072\verify.cjs
```

This checks syntax, model/source/integrity tests and the actual isolated browser, then verifies every owned file
is byte-for-byte unchanged. No package installation, download, evidence refresh, server, or foreground lease occurs.
Browser tests require the existing offline Playwright **1.56.1** and signed Edge **156**. They use only published
`testing\browser\isolated.cjs` (`53c0c0d`, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited
`finally` cleanup. No abandoned lifecycle prototype or unsafe browser flags are used.

For intentional first-time evidence capture only:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
node .\learning\S072\evidence-tool.cjs command browser-green 0 --test --test-reporter=tap .\learning\S072\tests\browser.test.cjs
Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE
```

Raw capture refuses to overwrite an existing label or browser receipt. Do not rerun this against published evidence.
`evidence-tool.cjs source`, `command`, and `seal` are deliberate producer actions, **not normal verification**.
The integrity manifest excludes only itself. A final seal includes the raw verification receipt; the final normal
verification must then be rerun read-only. Raw source, RED, and command bytes opt out of Git text conversion via this
directory's narrow `.gitattributes`; canonical Git-source integrity is checked separately. Raw artifacts also
disable text diff so publication checks do not reinterpret preserved TAP spaces/CRLF as editable source whitespace.
Owned runnable/documentation sources declare Git LF rules, although pre-existing working bytes can be CRLF.
The source manifest qualifies canonical Git LF; raw entries always require byte-exact integrity. An independent
Git clean-filter/blob comparison checks both policies. The normal runner additionally checks that all working
source/evidence bytes stay unchanged. Fresh LF checkouts and `core.autocrlf=true` are therefore both accounted for.

The first combined verification (`verification-green`, actual exit **1**, despite its requested label) exposed
an incorrect assumption that working text bytes already used LF. Its complete raw failure remains retained.
The manifest was corrected to distinguish qualified canonical source from untouched raw CRLF evidence;
`verification-green-002` then exposed Windows path spelling bypassing Git's path-specific attribute lookup
in the new integrity probe. That failed attempt is also retained. The corrected probe explicitly separates
canonical Git-tree `--path` keys from Windows filesystem paths. Subsequent combined results use new labels
rather than rewriting either failed attempt.

## Limits and incomplete parent remainder

The model has one burst, fixed-duration refills, FIFO order, fixed database capacity, identical synthetic values per key,
and no background traffic, retries, TTL, asynchronous completion, distributed locks, or actual cache/database.
Real concurrent cache-refill/database stampede certification is not performed.

No Azure/native result, production Node.js 24 validation, completed D-S072 source parent, or five-nines/statistical
claim is made. B-S072 and the source parent's actual-observation gates remain incomplete: an approved bounded native
configuration, CORE/DATA/HOST capabilities, authorization/leases, real refill pressure, client latency, and retained
failed-user evidence are still required. They are not falsely marked ready by this portable lesson.
Only the parent coordinator may independently review and Accept the single A-S072 unit.
