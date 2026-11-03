# C021: one incompatible contract and its explicit adapter

**Synthetic, local-only H005 component; one frozen S unit.** Open `index.html` directly in a browser. No server, package installation, framework, account, persistent store, or cloud resource is needed.

1. Keep `synthetic-001` and source implementation `v1`. Tab from the ID to the implementation and then the compare button; press Enter.
2. Read **RAW BREAKING** versus **ADAPTED SAFE**, the six actual consumer outcomes, and the complete semantic fields.
3. Try `synthetic-002` (including its empty topics) and `v2`. Change a candidate's contract, field, or source stamp and explicitly validate/adapt it.
4. Try an empty ID, `synthetic-999`, or malformed JSON. No safe default or stale successful candidate remains. Reset clears results and restores the visible starting controls.

## What actually changes

Accepted C020 at `2dc471daab3ffa202d83aba2df443e280cad3656` is reused **unchanged**:

- `contract.js`: the actual frozen catalog and stamps.
- `profiles.cjs`: the actual `getProfileV1` / `getProfileV2` exports, exercised by the Node tests.
- `inspector.js`: the actual `inspect` and **unchanged `oldConsumer`** exports. C021 exports that same function by identity, not a rewritten equivalent.

Both C020 implementations still return **`getProfile/1`**. Their implementation versions `1.0.0` and `2.0.0`, and their local deployment labels, are **not incompatible API versions**.

Only C021 deliberately introduces synthetic **`getProfile/2`**:

| getProfile/1 | C021 synthetic getProfile/2 |
|---|---|
| `profile.id` | `person.key` |
| `profile.displayName` | `person.name` |
| `profile.email` | `person.contact.emailAddress` |
| `profile.preferences.locale` | `person.settings.language` |
| `profile.preferences.theme` | `person.settings.colorScheme` |
| `profile.preferences.topics` | `person.settings.interests` |

No values are trimmed, normalized, split, reordered, dropped, or defaulted. `newConsumer` explicitly reads the new structure and returns the same business-field projection for comparison.

| Input → consumer | Result |
|---|---|
| C020 getProfile/1 → unchanged old | SAFE |
| Raw C021 getProfile/2 → unchanged old | BREAKING: `CONTRACT_MISMATCH` |
| Raw C021 getProfile/2 → explicit new | SAFE |
| Explicitly adapted getProfile/1 → unchanged old | SAFE |
| Original or adapted getProfile/1 → explicit new | BREAKING: `CONTRACT_MISMATCH` |

`adaptToOld` is a **one-way, explicit, fixture-specific adapter**, not a universal version negotiator. It requires the exact new contract, explicit known implementation/profile context, exact nested shape and types, unchanged catalog values, and coherent immutable provenance. Unknown versions, unknown profiles, changed business data, extra/missing fields, forged source stamps, and repeated adaptation fail with explicit codes. JSON is bounded to 16,384 characters; object inputs reject accessors without invoking getters, custom prototypes, symbols, cycles, sparse arrays, nonfinite values, and oversized/deep structures. This is data validation, not a sandbox for hostile JavaScript proxies.

## Pure APIs and honest provenance

`compatibility.js` is the same dependency-free factory in Node and the browser:

```javascript
const { getProfileV2 } = require('..\\C020\\profiles.cjs');
const { rehearse, makeBreaking, newConsumer, adaptToOld } = require('.\\compatibility.js');
const baseline = getProfileV2({ profileId: 'synthetic-001' });
const result = rehearse(baseline, 'v2', 'synthetic-001');
```

`makeBreaking`, `newConsumer`, `adaptToOld`, and `rehearse` all require explicit implementation and profile arguments. `parseCandidate(text, implementation, profileId)` validates a raw new-contract document without observing a service.

The browser loads the real C020 contract and inspector scripts directly and conducts a **bundled immutable-catalog replay**. It does **not** call either Node implementation, C020's existing real-loopback fixture, or any HTTP service. Node tests use the actual C020 implementations; the browser proves real DOM/keyboard/error/reset/CSP behavior of this replay. These are distinct evidence sources, neither invented HTTP observations nor native qualification.

Raw provenance names `C021-breaking-r1`, the synthetic rehearsal mode, original API contract, and an exact copied C020 source stamp. Adapted provenance additionally names `C021/getProfile-2-to-1/r1`, both contract identifiers, and the source fixture revision. There is deliberately **no top-level C020 `stamp`** on an adaptation: C020 `inspect` rejects it as an original C020 observation, even though its unchanged old consumer correctly reads the preserved business fields. All results are deeply frozen, independently allocated, and cannot mutate C020.

Stamps are immutable fixture labels; source SHA-256 hashes establish reproducibility, not cryptographic attestation, authenticated identity, production health, or deployment evidence.

## Verify without rewriting proof

From the repository root, using the existing **Node 22** test tooling:

```powershell
node --test --test-reporter=dot capability\C021\tests\compatibility.test.cjs capability\C021\tests\guards.test.cjs capability\C021\tests\integrity.test.cjs
node capability\C021\tests\syntax.cjs
node capability\C021\tests\browser.cjs
```

Normal tests are read-only to `evidence\` and `evidence.json`; the browser check verifies this itself. The browser uses only existing `testing\browser\isolated.cjs` `openIsolatedLesson`, pinned offline Playwright **1.56.1**, and the installed Microsoft-signed **Edge 156** binary (its recorded signature provenance and current SHA-256 are checked). Before import and after awaited cleanup it requires the byte-exact published helper at **`53c0c0d82cc1`**, SHA-256 **`86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`**. It closes its exact isolated browser in `finally`, including on assertion failure. It uses no integrated foreground browser, downloads, unsafe flags, listener, helper bypass, or lifecycle prototype.

Only an intentional capture writes browser proof:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node capability\C021\tests\browser.cjs }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE }
```

`tests\capture.cjs <new-stage> <Node arguments...>` is an explicit, create-once command recorder; it retains raw stdout/stderr bytes as lossless gzip, actual exit status, runtime, timestamps, and source hashes. Raw-stream SHA-256 values describe the decompressed bytes, including assertion whitespace. It is not invoked by ordinary tests. `evidence.json` links the chronological BDD → loadable stub → **five authentic assertion failures, one passing C020 baseline check** → IaC N/A → implementation → original six assertions green → expanded validation → actual browser evidence.

The first explicit browser capture stopped before launch because its provenance list incorrectly included a removed experimental shared-helper file. That metadata failure is retained in `browser-green.*` and `browser-attempt-missing-provenance.json`; it is not behavioral RED. The corrected driver hashes only the existing approved helper/package files; it does not change or bypass the helper. Actual passing browser evidence is `browser-verified-green.*`.

An earlier ordinary, capture-unset browser run imported the abandoned shared lifecycle prototype. Its transcript-only observation is explicitly historical and unqualified in `historical-helper-attempt.json`; no blocked lifecycle recovery shipped here. Qualified captures include `browser-published-helper-green.*`; the latest final-LF-source capture is `lf-source-browser-green.*`, followed by capture-unset verification against the published hash with awaited cleanup.

The first scoped publication precheck correctly rejected trailing spaces in captured TAP test names. No commit/push occurred. The existing raw streams were then losslessly gzipped, never trimmed or re-recorded; their original metadata bytes are retained under `evidence\metadata-originals\`. Updated record pointers and the manifest document this explicit archival migration. Later captures use gzip directly.

A second precheck caught CRLF terminators as trailing CR after enabling byte-preserving attributes. Current runnable text was explicitly normalized to LF, not exempted from whitespace checks. The **byte-exact original BDD, stub, and initial tests**, including their original CRLF terminators, are archived as `evidence\red\*.original*.gz`; integrity checks prove that runnable historical copies differ only in newline encoding. The owned `.gitattributes` now preserves the final LF source and binary proof bytes on checkout without diff/whitespace suppression, helper changes, or lost original evidence.

Reproduce the original RED without changing the implementation:

```powershell
$env:C021_RED_SUBJECT = '..\..\compatibility.stub.snapshot.js'
try { node --test capability\C021\evidence\red\compatibility.initial.snapshot.cjs }
finally { Remove-Item Env:\C021_RED_SUBJECT }
```

Expected: five `AssertionError` failures, not import/syntax errors. The retained `.snapshot.cjs` is never auto-discovered by normal test naming; only this historical test honors that override. The LF runnable `compatibility.stub.snapshot.js` sits beside the implementation so its original C020 imports still resolve. Without the override, the same six assertions pass against the implementation. Original raw logs, BDD, stub, test bytes, and execution metadata remain byte-exact in their archives.

## Scope and next work

IaC **N/A**. No packages, root/shared changes, new server, Azure execution, scaffold, identity registration, auth/session/store implementation, deployment, expenditure, native qualification, or production/Node 24 certification. The actual recorded runtime is test tooling only; C001's approved future Node 24/Express/App Service Linux design is not implemented here.

This single card does not finish H005, P005, a source parent, or any native card. Existing To Do scopes remain distinct: C023 is the checkpoint/effect ledger, C022 is separately gated identity/session isolation, C024–C029 are their own transport fixtures, and C048 remains gated on accepted C021 **and** C023. Do not duplicate these as extra cards or award extra credit. C021 is ready for controller review after its scoped publication, not self-accepted.
