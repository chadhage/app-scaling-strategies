# S103 — Synthetic certificate/hostname continuity

**Training rehearsal - synthetic data - not a live Azure result**

Open `index.html` directly. Standard HTML, local JavaScript, and CSS only; no server, account, framework, network request, certificate operation, or Azure management access.

## Contract and exercise

- **Card:** A-S103; **source parent:** D-S103; **packet:** SC-S103; **frozen Kano unit:** A-S103, S; **gate:** SOURCE.
- **Objective:** Select certificate/hostname combinations; reject an invalid eligible destination.
- **Source requirement:** Every eligible destination supports the required hostname and trust configuration. [Exact source/acceptance mapping](evidence/source-contract.json).
- **Preconditions:** Fixed old/candidate eligible destinations, one excluded parked destination, two required synthetic clients, and old-only initial admission.
- **Actions:** Choose a fixed hostname, certificate, and inventory. Rehearse checks; inspect each eligible destination/client result; check candidate admission. Compare a compatible combination with a hostname mismatch, untrusted/expired certificate, incompatible TLS, or unknown evidence.
- **Measurements:** Four fixed observations per rehearsal, reported separately as pass/fail/unknown. An excluded destination contributes neither success nor failure. A correct rejection passes only the gate verifier, not the failed or unknown synthetic client checks.
- **Expected assertions:** Candidate admission requires all four observations to pass. Failure, unknown, or absent evidence cannot approve it. Rehearsing a new combination revokes the previous candidate approval; old remains admitted.
- **History:** Six measured attempts, immutable in-memory history. Reset restores current selectors, old-only admission, and keyboard focus **without erasing earlier outcomes or restoring the attempt allowance**. Reload starts a separate, explicitly new rehearsal.
- **Guards:** Exact typed enum selectors and command shapes; immutable privately issued states only. Unknown fields, getters, inherited/non-record inputs, fabricated/serialized state, repeat decisions, and excess attempts fail without mutation.
- **UX:** Keyboard-native selectors/buttons, visible focus, announced errors/status, visible no-script/load failure, and restrictive CSP. No control shadows `form.reset`.

All certificate/SAN, hostname, client-trust, validity, TLS, and eligibility fields are **fixed teaching DATA ONLY**. No actual certificate, credential, private key, trust store, system/TLS/DNS setting, endpoint, or external probe is accessed or configured.

## Delivery order and verification

BDD: `certificate-continuity.feature` → loadable model stub → genuine assertion RED (`unknown !== pass`) → [IaC N/A](evidence/iac-decision.json) → implementation/refactoring → focused tests/syntax/integrity → actual isolated-browser observations.

From the repository root in PowerShell:

```powershell
node --test .\learning\S103\model.test.cjs
node --check .\learning\S103\model.js
node --check .\learning\S103\app.js
node .\learning\S103\verify-integrity.cjs
node --test .\learning\S103\browser.test.cjs
```

Browser verification is read-only by default. `CAPTURE_BROWSER_EVIDENCE=1` is reserved for deliberate capture into this lesson's evidence directory. Raw RED, its stub, and assertion snapshot live in `evidence\red\`, outside automatic test discovery; their original bytes are never normalized. Only this raw archive has `-text -whitespace` attributes, preserving snapshot CRLF and TAP indentation without treating them as authored-source whitespace defects. Source files retain whitespace checks. Canonical Git integrity is recorded separately from working-tree byte hashes.

Recorded results: **31 focused cases** passed; **10 actual Edge DOM/keyboard/error/reset/failure/CSP observation groups** passed (11 Node browser tests including their parent wrapper). [Focused evidence](evidence/focused-green.json), [actual browser observations](evidence/browser-acceptance.json), and [original-byte/canonical-Git index](evidence/content-index.json). The original RED transcript is 1,045 bytes, SHA-256 `99a2ffb3b5b45d9f1c5c881db551706c22b6fca4eaaa3f60f00829123a7edc97`; it contains LF, with no CRLF to normalize.

Use only published `testing\browser\isolated.cjs` (`53c0c0d`, SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055`), `openIsolatedLesson`, and awaited `finally` cleanup. Offline Playwright 1.56.1, installed Microsoft-signed Edge 156, and Node 22 are local tooling only, not Node 24 production or unattended lifecycle qualification. No prototype, browser-security bypass, foreground lease, install, or download is used.

## Honest remaining work

B-S103 remains a separate blocked native sibling: require qualified CORE/DATA/HOST/C092 and P006's explicitly owned leased hostname/domain, target, client trust profiles, consent, and cleanup envelope before admission. Its real client hostname/trust results and exclusion of invalid candidates cannot be inferred from this synthetic matrix. D-S103 and P006 remain incomplete. The parent alone reviews/Accepts A-S103 once; tests, repairs, refinement, and publication earn no additional units.
