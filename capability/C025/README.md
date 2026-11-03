# C025 — resume exact synthetic bytes

**[C025][S] · H005 · one local capability.** Entry C020 is accepted.
Its `contract.js` and `profiles.cjs` are imported unchanged, not copied.
Each immutable 8192-byte artifact contains the actual C020 profile response
and lineage followed by deterministic binary bytes. Two profiles × two versions
have distinct SHA-256/strong ETags. No user files, uploads, credentials or randomness.

## Conduct locally

From the repository root, using the existing Node.js tooling:

```powershell
node .\capability\C025\server.cjs
```

Open the printed `http://127.0.0.1:<port>` origin. Pin an original, fetch a range,
pause, then resume one chunk or to completion. The page exposes actual HTTP
intervals, first-missing-byte cursor, original/assembled hashes and retained
failed/unknown attempts. Changing the request version **does not repin**.
Restore the original version to resume; explicit Reset discards in-memory state.
The listener has no host/port/consent overrides, rereads current C001 local consent,
binds only `127.0.0.1`, and closes its exact handle/connections after **10 minutes**.
The test API accepts only a positive lifetime ≤ **15 minutes**. Ctrl+C also closes it.
No foreground browser lease is used.

## Actual HTTP contract

- `GET /api/catalog`: synthetic identities from C020, local scope and expiry.
- `GET /api/manifest?profileId=synthetic-001&version=r1`: pinned original identity,
  byte length, hash, strong ETag and C020 lineage. Parameters must be explicit/unique.
- `GET /artifact?profileId=synthetic-001&version=r1`: original binary body, HTTP 200.
  A single `Range: bytes=0-1023`, `bytes=1024-` or `bytes=-256` returns actual **206**
  bytes, inclusive `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`,
  strong ETag and artifact/lineage headers. Large end/suffix values clamp to EOF.
- Malformed/multiple/reversed/unsafe-integer ranges: **400**.
  Out-of-bounds start or zero suffix: **416**, `Content-Range: bytes */8192`.
  Unknown profile/version: **404**. Invalid queries/body: **400**. Other methods: **405**.
- Matching strong `If-Range` permits 206. A different valid strong tag returns the
  **whole new 200 representation**, following HTTP semantics; the client **rejects**
  it rather than appending/restarting. A mismatched `If-Match` is **412**.
  `If-Match: *` is supported. Weak/date/multiple validators are outside this bounded
  fixture and explicitly rejected. HEAD ignores Range and returns 200 metadata/no body
  (or the same conditional/input failure), not an invented partial body.
- GET/HEAD only, exact loopback Host, same-origin browser requests, no redirects,
  no CORS, whitelist-only assets and restrictive CSP. These are local guards,
  **not authenticated identity or cryptographic server attestation**.

The client rejects wrong identities, validators, lineage, totals, body lengths,
request/response intervals, encoding and conflicting overlap **before accepting
new bytes**. Duplicate ranges add zero coverage; holes keep the cursor at the first
missing byte. Only full coverage plus a freshly computed matching SHA-256 exposes
verified bytes. Complete corrupt bytes remain hash-mismatched; unavailable hashing
is unknown. Failures survive recovery; a later failed attempt clears the latest
success-shaped status. History is capped at 64 attempts plus an explicit terminal
limit record, never silently truncated. Reset is the deliberate discard operation.

## Verify without modifying historical proof

```powershell
Push-Location .\capability\C025
node --test --test-reporter=tap
node .\tests\syntax.cjs
node .\tests\integrity.cjs
node .\tests\browser.cjs
Pop-Location
```

The real browser runner verifies the published shared helper's exact SHA-256,
calls only `openIsolatedLoopback(relativeEntry, actualOwnedHttpServer)`, uses a
bounded owned listener, and awaits `session.close()` then the exact `server.close()`
in nested cleanup. The helper forwards real owned HTTP responses with guarded
`route.fetch`; this is **not mocked range data or native Chromium TCP certification**.
Normal runs are read-only to proof. Only an intentional
`$env:CAPTURE_BROWSER_EVIDENCE='1'` run refreshes `evidence\browser-acceptance.json`;
remove that environment variable afterward. `tests\capture.cjs` is an explicit
evidence-generation command, not part of ordinary test discovery.

BDD preceded a loadable stub and three genuine behavioral AssertionErrors.
IaC N/A was recorded before implementation. Exact RED sources are retained with
`.txt` extensions under `evidence\red`, not auto-discovered tests.
`evidence.json` maps the ordered evidence; `evidence\integrity.json` covers owned
deliverable bytes and unchanged provider/helper lineage.

**Scope:** Node.js 22.23.4 is test tooling only. No Node.js 24 certification,
Azure Blob/native/cloud proof, durable resume, auth/session isolation,
IaC/scaffold/identity/deployment/spend, or completed H005/source-demo claim.
This card does not finish other To Do protocol/native/durable work.
