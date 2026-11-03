# S065 — Hot-shard rebalancing rehearsal

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` in a modern browser. No install, server, credentials or subscription is needed.
Only `learning\S065\**` belongs to this A-S065 / D-S065 / SC-S065 delivery: one frozen **S** unit.

## Exact source and scope

Read before behavior design:

- [README S065](../../README.md): **Hot-shard rebalancing:** move tenants or partitions without missing writes or assigning two active owners.
- [Backlog D-S065](../../.docs/wiki/backlog.md): hot-tenant partition/shard rebalance under **live read/write load**; ownership changes preserve committed effects and routing, with no two writers owning the moved partition. Its source prerequisite remains D-S064.
- [A-S065 and portable A-card contract](../../.docs/wiki/kanban.md): **Move a hot partition; detect routing gaps and simultaneous active owners.** SOURCE gate; packet SC-S065. The inventory assigns A-S065 and native sibling B-S065 to that packet; no delighter companions are inferred.

This lesson does not certify the source acceptance. Actual partitions, migrations, load,
read/write effects, routing and exclusive ownership require B-S065 and the original D-S065 gates.
Those are incomplete, not new lesson/test/plumbing units. No shared or root registry is edited;
`manifest.json` is the portable discovery contract.

## Conduct the exercise

1. Choose routing, ownership, target copy and observation coverage. Optionally predict success, failure or unknown.
2. Start the attempt. Configuration is frozen.
3. Use **Observe next phase** three times: before → cutover → after.
4. Inspect the boundary and operation tables, measured result, impact and cleanup separately.
5. Check your prediction. This never changes the verdict.
6. **New attempt** retains previous completed results and traces. Six attempts are allowed;
   **Reset all attempts** explicitly clears all in-memory history and restores defaults/focus.
   Reload also clears memory. Nothing is persisted to storage.

Use Tab, arrow keys, Enter and Space. A skip link, visible focus, labels, live status and focused
error message support keyboard use. No control is named or identified `reset`; native `form.reset()`
is not shadowed.

HOT starts on shard-old at supplied epoch 7 with effect H0; COLD stays on shard-cold with C0.
Each phase attempts one write/read pair for each partition: twelve operations total.
The target copy includes H1 or deliberately omits it. The cutover transfers HOT to shard-new at
supplied epoch 8. The overlap fault leaves both owners active during cutover, then fences the old
owner in the after phase. The coordinated route is a **model ordering**, not proof of atomic
cutover or distributed fencing.

| Condition, with other inputs safe | Measured synthetic result |
| --- | --- |
| Coordinated + exclusive + current + complete | success: 12 successful operations, 4 successful hot target operations, 0 route gaps/dual owners/missing effects |
| Gap during cutover, then recover | failure: 2 hot operations fail; gap remains in history |
| Stale route to fenced old owner | failure: 4 hot operations fail; cold control requests still succeed |
| Both hot owners active at cutover | failure even if all 12 operations succeed |
| Target omits acknowledged H1 | failure: 2 hot reads report missing H1 |
| Cutover observations missing | unknown unless an observed failure exists elsewhere |
| All observations missing | unknown: 12 unknown outcomes, not 12 successes |

Success needs complete evidence, acknowledged-effect continuity, correct routes, target exposure
and one observed active hot owner at every boundary. Known failure dominates unknown.
An expected fault detected by tests is **not** a successful migration. Cold control traffic and
configured intent are not hot relocation evidence.

## Verification and deliberate evidence capture

Existing Node 22.23.4 tooling only:

```powershell
node --test --test-concurrency=1 .\learning\S065\tests\model.test.cjs .\learning\S065\tests\surface.test.cjs .\learning\S065\tests\integrity.test.cjs
node --test .\learning\S065\tests\browser.test.cjs
node --check .\learning\S065\model.js
node --check .\learning\S065\app.js
```

Normal tests **only read** retained proof. The actual browser check uses the published
`testing\browser\isolated.cjs` (`53c0c0d`, SHA256
`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`,
and awaited `finally` close. Existing offline Playwright **1.56.1**, signed Edge **156** and Node **22**
are the only qualified test pair. No installs, downloads, unsafe flags, foreground lease or
abandoned lifecycle prototype are used. The helper's documented unattended lifecycle limitation
remains; these focused actual checks do not qualify it as a production runner.

Only when deliberately replacing owned browser evidence:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE='1'
try { node --test .\learning\S065\tests\browser.test.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

The test writes owned DOM/keyboard/error/reset/failure/unknown/CSP evidence and a screenshot only
with that exact opt-in. Test instrumentation's harmless inline-script probe is expected to be
blocked; it is not application code. Normal verification never regenerates the source integrity
seal or capture. If intentional source/evidence changes are made, explicitly reseal via
`node .\learning\S065\tests\seal.cjs --write` after review.

BDD preceded a loadable stub and genuine `ERR_ASSERTION` RED (`unknown !== success`).
`evidence\red\` contains non-auto-discovered exact stub/test snapshots and raw CRLF output.
The subsequent explicit IaC N/A decision preceded implementation. Owned `.gitattributes` keeps
only `evidence\raw\**` and `evidence\red\**` byte-exact; source integrity is qualified as canonical
UTF-8/LF, independently checked against Git's path-filtered blobs. Tests, captures and repeated
runs do not create extra Kano units.

## Limits and disclaimer

All data, owner epochs, routes, copies and outcomes are deterministic synthetic fixtures.
There is no actual concurrency, partition movement, replication, data migration, routing table,
writer fence, database or live load. No real authentication/registration, credentials,
management calls, cloud/IaC/deployment/spend, native Azure, production Node 24, five-nines or
source-parent certification is implied. Browser refresh discards memory rather than modeling
durable orchestration.

Microsoft Open Source Disclaimer: these educational examples are provided AS IS without
guarantees. Microsoft/Azure references do not imply endorsement, certification or support.
Project goals are not Microsoft SLAs; the disclaimer is not a license. See the
[full repository disclaimer](../../README.md#microsoft-open-source-disclaimer).
