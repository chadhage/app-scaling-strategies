# C041 — one local portable lesson host

**Training rehearsal · synthetic data · not a live Azure result · no management access.**
C041 (S, H002/H008) is an HTML/JavaScript component demonstration, not a production app.
It does not complete an A lesson's parent scenario, prove a native B scenario, or certify reliability.
IaC is **N/A**. No Azure calls, credentials, registration, deployment, resources, or expenditure are involved.

## Run locally

From the repository root:

```powershell
node .\capability\C041\serve.cjs
```

Open the printed `http://127.0.0.1:<port>/` URL. The helper binds **only IPv4 loopback**,
expires after 15 minutes, and supports Ctrl+C. Stop the exact owned process when finished.
Do not disable browser security or run this demonstration from `file:` URLs.
Node v22.23.4 is the observed test tooling, not validation of C001's production runtime.
There are no packages, framework, root-app changes, or shared test-scaffold imports.

## Selection and acceptance boundary

Only exact IDs **A-S001** and **A-S003** are selectable. Nothing mounts automatically.
`accepted-catalog.js` is recursively frozen and duplicates the bounded read-only
`evidence\accepted-ledger-snapshot.json`: ledger revision 87, captured 2026-11-03T14:07:58Z,
with source hash, controller acceptance, publication SHA/tag, and asset hashes.
Historical child manifests still describe their original publication status; the current accepted
ledger snapshot, not those stale descriptions or file existence, is the selection authority.

This is a reviewed offline allowlist, **not** a signed authorization service or a live revocation feed.
Adding a lesson requires independent acceptance verification, an explicit reviewed catalog change,
new asset pins, and new interaction/isolation checks. Planned, unaccepted, other accepted-but-unselected,
unknown, native B, URL, path, alias, encoded, and whitespace-modified IDs are refused.
A refusal removes the previous frame rather than displaying stale content for the rejected selection.
Child asset pins intentionally identify the exact reviewed Windows-checkout bytes. A different
checkout's line endings also fail closed: do not normalize or repin silently. A future harness
must review any changed byte representation. C041's owned attributes preserve its own evidence
and source-pin representations; no attributes or files in closed lesson namespaces are changed.

## Reuse and isolation contract

Load `accepted-catalog.js`, `host-policy.js`, then `lesson-host.js` under an equally restrictive
trusted parent CSP. `C041LessonHost.createHost({ mountPoint, status })` accepts two elements from
the same document and returns only `mount(exactId)`, `unmount()`, `focusLesson()`, and `currentId()`.
`mount()` returns a frozen selection/refusal; it never accepts a URL or caller-supplied catalog.
A future harness must expose the same exact `/c041-lessons/<approved-ID>/<pinned-file>` routes
and response policy. The demonstration page is not the repository's root app.

* The iframe uses **`sandbox="allow-scripts"` without `allow-same-origin`**. Its effective origin
  is opaque. It cannot reach the parent document/API or embedding element, submit forms, open
  popups, navigate the top, or acquire same-origin storage authority.
* The loopback helper independently sends lesson response CSP with `sandbox allow-scripts`,
  local classic scripts/styles only, and `connect-src`, `frame-src`, `worker-src`, `form-action`,
  `object-src`, and `base-uri` set to `'none'`. Original lesson bytes and meta CSP stay unchanged.
  The host allows local scripts/styles and same-server frames, but no connections, forms,
  workers, objects, inline code, or evaluation. No unsafe browser flags are needed.
* Permissions Policy denies camera, microphone, location, payment, USB, clipboard, fullscreen,
  and display capture. No CORS grant is emitted. Nonmatching Host headers and explicit foreign
  or opaque Origin headers are refused; absent Origin headers on normal local asset loads are allowed.
* There is **no production message listener**, child-result bridge, management API, credential,
  role, workflow conductor, approval delegation, or cloud client. All child messages are ignored.
  A frame request is not presented as lesson completion, successful loading, or a certified result.
* The helper caches exact allowlisted assets after verifying child hashes and regular real paths.
  It never serves a directory, repository root, `.git`, ledger, tests, evidence, arbitrary path,
  management endpoint, or planned lesson. Only GET/HEAD are supported; raw traversal/encoding,
  query selection, backslashes, and alternative authorities fail closed before URL normalization.

This is **not a safe general arbitrary-content browser**: accepted scripts can execute within their
own frame, consume resources, or navigate that frame to other documents. The helper cannot enforce
Internet egress policy for a future hostile document navigation. Opaque-origin sandboxing still
prevents parent access, but accepting hostile content or stronger network/process containment
requires a separate reviewed design. Do not add `allow-same-origin`, weaken CSP, or infer production
authentication, authorization, tenant separation, native-host qualification, or live approvals.

## Keyboard and evidence

Tab reaches the skip link, exact-ID input, and mount button. Mount keeps focus on its control.
“Enter chosen lesson” focuses the named frame; native Tab/Shift+Tab traverse real child controls
and return to the host without key interception. “Unmount” clears memory and returns to the picker.

```powershell
node --test --test-reporter=tap .\capability\C041\tests\policy.test.cjs .\capability\C041\tests\catalog.test.cjs .\capability\C041\tests\server.test.cjs .\capability\C041\tests\evidence.test.cjs
```

`evidence.json` distinguishes authentic loadable-stub RED, Node/real-HTTP GREEN, syntax,
and actual-browser observations. Original RED TAP bytes are retained in hash-verified gzip archives;
readable copies remove only line-end whitespace/CRLF to satisfy the publisher's whitespace gate.
No assertion or outcome is changed. `tests\browser-checks.cjs` contains dependency-free
Playwright-page acceptance functions for a future harness; it is not a Node browser substitute.
Browser checks must use a real browser, an owned page, bounded assertions,
and the owned helper. The verified shared isolated-headless helper is preferred and needs no
foreground lease; its guarded loopback API must approve the actual caller-owned server.
The arbiter-grant requirement applies only to integrated foreground use. Source scans and Node
results alone do not prove browser isolation. Run the owned headless acceptance runner with:

```powershell
node .\capability\C041\tests\browser-run.cjs
```

It closes both the exact browser session and the exact caller-owned HTTP server in `finally`.
The verified helper forwards same-owned-origin GET/HEAD responses using guarded
`route.fetch({ maxRedirects: 0 })`; all redirects, writes, other origins/ports, WebSockets,
and service workers are blocked. Observed real DOM, child-body hashes, keyboard, opaque origin,
and CSP checks are **not certification of native Chromium TCP transport**. No response policy,
browser sandbox, security flag, TLS check, global profile, or child file was weakened.
Controller review/acceptance remains separate from scoped publication.
