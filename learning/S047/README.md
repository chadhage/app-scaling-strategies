# S047 — gRPC application continuation

**Training rehearsal - synthetic data - not a live Azure result**

Card **A-S047**, parent **D-S047**, packet **SC-S047**, frozen Kano **S** / unit **A-S047**. Open `index.html` directly in a modern browser. No server, Azure account, authentication, credentials, framework, or package installation is needed.

## What this teaches

The [source S047](../../README.md#e-in-flight-requests-and-long-lived-work) requires application-level continuation when infrastructure cannot preserve an original gRPC stream. The A-card specifically compares native-shaped and browser-proxy traces; ordinary HTTP is not streaming proof. Exact source/backlog/card text and the portable contract are retained in `evidence\source-contract.json`.

Eight synthetic results are numbered 1–8. Start v1 with acknowledgement 3, cut over, resume after the acknowledgement on a **different** stream, and check. Expected output is 1–8 exactly once in both observations, a request for result 4, explicit original-stream closure, HTTP/2 + `application/grpc` + `grpc-status: 0`, and 120/200 synthetic milliseconds on the **original** clock. This is a passed fixture assertion, not an actual gRPC exchange.

Choose replay, skip, or no continuation to expose duplicates or missing results. Independently drop/repeat a proxy result. HTTP 200 with gRPC status 14 fails; ordinary HTTP/1.1 JSON is **UNSUPPORTED**, even when the proxy succeeds. Missing trailers/native/proxy receipts are **UNKNOWN**; unknown counts are not reported as zero losses. A known failure wins over unsupported evidence, then unknown evidence, then pass, while each observer retains its own verdict.

Inputs are integers: acknowledgement 1–6, resume delay 0–1000 ms, original budget 1–1000 ms. Each emitted result costs 10 synthetic ms; the inclusive budget is not restarted at cutover. These are lesson bounds, not platform limits.

## Keyboard, reset, and limits

Tab through labeled controls; Enter activates Start and ordered buttons, and Space also activates buttons. After each action focus moves to the next valid action. Configuration is locked after admission. Invalid inputs/actions leave state unchanged and announce an error. Reset restores exact defaults and acknowledgement focus using the native form-reset prototype, not a shadowable `form.reset` member.

Reset preserves checked failures and records unfinished attempts as UNKNOWN with partial receipts. The eight newest full outcomes, including original configurations/traces, remain in page memory. Repeated reset creates no fictitious attempts. Reload/close clears this explicitly session-local history. No remote resources exist to clean up.

External scripts/styles are local. CSP forbids connections, inline scripts, dynamic evaluation, objects, forms, frames, and workers. Rendering uses text nodes, not injected HTML. This does not substitute for hosted authentication or server-side authorization.

## Focused verification

From the repository root, using the existing Node.js **22.23.4 test tooling**:

```powershell
node .\learning\S047\verify.cjs
```

This runs the focused model/surface suite, syntax checks, actual isolated DOM/keyboard/error/reset/failure/CSP checks, and evidence integrity. It leaves published proof unchanged. It neither certifies production Node.js 24 nor installs dependencies.

To run only the browser checks, without changing proof:

```powershell
node .\learning\S047\tests\browser.cjs
```

Browser testing uses only the published `testing\browser\isolated.cjs` at SHA-256 `86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055` (commit `53c0c0d`), `openIsolatedLesson`, and awaited `finally` cleanup. Its existing offline Playwright **1.56.1** / Microsoft-signed installed Edge **156.0.4314.50** pair is the tested scope. The helper's documented lifecycle limitation is not erased by this lesson; the abandoned recovery prototype is not used or qualified.

Historical proof is append-only. A **deliberate** additional browser capture, not normal verification:

```powershell
$env:CAPTURE_BROWSER_EVIDENCE = '1'
try { node .\learning\S047\capture.cjs browser-004 }
finally { Remove-Item Env:\CAPTURE_BROWSER_EVIDENCE -ErrorAction SilentlyContinue }
```

The browser writer uses the next unused receipt filename and never overwrites an earlier capture. New deliberate proof requires a deliberate content-hash refresh before it can join the sealed evidence inventory.

## Evidence and retained native remainder

`stream.feature` preceded the loadable stub. Raw `stub-load` output proves the entire callable API ran. The genuine RED is `ERR_ASSERTION`, **1 !== 4**: naive restart requests result 1 instead of the first unacknowledged result 4. Frozen BDD/stub/assertion `.snapshot` files under `evidence\red\` are not auto-discovered tests. `tests\replay-red.cjs` intentionally exits 1; integrity checks require that exact behavioral failure, not a missing module/tool. The post-RED, pre-implementation IaC N/A record preserves the unchanged stub hash.

Raw command, timestamps, runtime, exits, stdout/stderr, source hashes, browser checks, and sealed content hashes are retained under `evidence\`. `evidence.json` describes verification scope; only the parent coordinator can accept this one unit.

The first tooling capture retains a Windows PowerShell module-autoload failure. The corrected probe uses the already-installed PowerShell 7 executable (`pwsh.exe`); no tool, dependency, or browser was installed. Subsequent captures identify the source revision they actually checked.

The first browser capture retains 14 passing groups and a CSP-probe timeout. DevTools evaluation was not a valid test of page-origin dynamic evaluation. The corrected CSP probe loads a local page script under the actual page policy; its evidence separately records debugger evaluation. No CSP or browser security setting was weakened.

The first publication stopped at its whitespace guard before commit/tag/push. Native Windows stdout/stderr must remain byte-exact, so these raw transcripts are explicitly binary artifacts. The unchanged native CRLF IaC decision has a scoped CR-at-EOL whitespace declaration; all normal source whitespace checks still apply. The rejected guard output, original attributes/summary, and earlier seal are retained. The final explicit seal includes that older seal; no historical capture is overwritten.

Relevant To Do refinement: **B-S047 remains unclaimed and not ready** without CORE, DATA, AKS, C028, C074, a qualified native driver/gateway, approved target and lease. Its future check must observe actual native HTTP/2/gRPC continuation separately from browser-proxy behavior. D-S047 also needs P003, BASE, and its original acceptance. No native/source-parent completion, extra testing/plumbing unit, cloud/IaC generation, deployment, identity registration, or spending is included here.

AS IS educational demonstration; no Microsoft endorsement/support, SLA, or five-nines guarantee. See the [project disclaimer](../../README.md).
