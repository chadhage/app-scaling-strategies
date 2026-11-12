# C047 — server-side candidate preview authorization

Original frozen D unit, H009/H012. Local synthetic offline HTTP fixture only;
not Entra, an identity provider, an Azure deployment or a production readiness claim.
No new frontend is introduced. Every candidate representation is JSON.

## Authority and actual mounts

`server.cjs` is the **one complete new production executable scope**. Its frozen
`ROUTES` table is the actual dispatcher, not a separate mock inventory. The seven
profile representations, two manifest representations and two project-create
paths include direct `/candidate`, `/v2` and `/assets/candidate.json` access.
Unknown, normalized, encoded and source-file aliases are not mounted.

Preview requires the accepted C022 `project.create` permission: the **current
member/admin role of a verified one-tenant session**. C009 public reads,
fixture owners, cookies and supplied role/tenant/owner headers confer nothing.
The C022 service is called again after every awaited admission/body/queue boundary,
immediately before actual candidate serving or its real tenant-owned create effect.
Expired, logged-out, revoked, demoted, refused and disconnected requests cannot
commit that effect. Manifest tenant and project owner come from accepted authority.

The original C022 in-process `issueTicket` stand-in is reused; no HTTP route
issues tickets. Anonymous bootstrap remains permission-free; optional-anonymous
ticket login retains C022 token/session rotation, one-tenant binding and replay
refusal. Session whoami/logout/switch and admin role/revoke use the same service.
Only the inspection scope routes `/` and `/scope.json` are public.

`imports.json` qualifies all twelve actual transitive production imports by
accepted publication, Git blob OID, actual Git form, observed working form and
explicit LF/CRLF SHA-256. C009 comes from accepted U053 `b956cd0e`, with its
unchanged canonical f95 production. C022 comes from original accepted `23b4bc74`;
its actual published Git blobs include CRLF. Those bytes are not silently
normalized or replaced. Producers, existing import pins and histories are untouched.

## Verification

From a repository containing this namespace and its accepted producers:

```powershell
node capability\C047\verify.cjs
node capability\C047\verify.cjs coverage
```

The programmatic mount is `createApp()` from `server.cjs`, with the returned
`server` explicitly bound by its owner to `127.0.0.1` on port zero and closed
through its idempotent `close()`. The owner may issue a synthetic login ticket
through `issueTicket({ user, tenant })`; clients can only exchange an already
issued ticket at `/v1/session/login`. This is the accepted C022 stand-in, not
permission to create an identity provider or mint tickets over HTTP.

Ordinary verification has its own local 180-second failure watchdog; it does not
consume the expired private worker GO. Tests enumerate all actual production and
test files and require a positively loaded per-file 85/85/85 coverage row.
The initial private ungated specimen is behavioral RED, **not** a published
regression. Its original tests pass unchanged on the implementation.

`.gitattributes` is own-namespace persistent policy: executable/docs use LF,
JSON/JSONL, historical `.source.txt` and compressed evidence remain raw `-text`.
Private raw captures/programs remain immutable. Any public evidence is separately
hashed and explicitly labeled a projection, never original raw history.
An exact-owned private Git **transport fixture is not publication or a C047 HEAD**.
The parent exclusively applies, live-tests, publishes and independently accepts.

## Retained attempts and semantic evidence

The private original RED has two genuine behavioral failures and one real
authorized positive. Its three acceptance tests are unchanged in GREEN.
`boundary-red-01` additionally exposed one actual disconnected effect among six
tests; the own destroyed-socket checks correct it without a producer edit.

The first input qualifier incorrectly assumed C022 published Git bytes were LF.
That failed preflight's exact original program and observed error are retained;
its original full terminal raw was **not captured**, and is not reconstructed or
represented by a later replay. Two browser-input preflights also rejected actual
accepted CRLF working forms before those exact source/data forms were qualified.
No accepted source or sealed policy was edited to get past a refusal.

`coverage-01` passed all 34 tests with a real 100 / 98.17 / 100 production row but
exited nonzero because Node could not clean up an empty `NODE_V8_COVERAGE` path.
`coverage-02` preserves that failure and passes using an owned absolute directory.

The first mutation capture failed its pristine control on a Windows ESM reporter
path. It ran zero semantic variants. A second 606-variant campaign could not
detect caught runtime faults and is **superseded, not semantic closure**. The
authoritative third campaign observes thrown runtime faults independently:
**230 named assertion kills, 222 runtime/module NON-kills, 91 timeout NON-kills,
63 survivors** over **606 changed compiled positions**. The full AST has 629
variants, including two syntax-invalid NON-kills and 21 identity NON-kills.
Every whole-mutant fault and timeout stays in the semantic unresolved domain.
Only separately recorded, exact-source, runnable **local** contrasts may close
such a position; they are not whole-mutant kills or global equivalences.

Current resource, browser, local-contrast, privacy, complete-source and fresh-form
results are read from their actual records, not inferred from these descriptions.
An incomplete gate grants neither original acceptance nor Kano credit.

The independently recomputed current closure is **606/606**: the same 230 actual
named whole-mutant kills plus **376 specific runnable local contrasts** (269
real-frame/import contrasts and 103 + 1 + 3 additional real-authority/owned-handle
contrasts with actual unchanged negative controls). There are zero semantic
unresolved positions and zero claimed global equivalents. The 222 runtime/module
faults and 91 timeouts remain NON-kills in the original full campaign.
Earlier local attempts left four, then three positions unresolved; those exact
attempts are retained rather than overwritten. `closure-01` failed on an audit
comparison of cross-realm AST objects against their JSON transport; `closure-02`
compares the complete exact serialized domain and independently verifies every
current closure, source, stream, negative control and process identity.

The one resource campaign completed **64 total groups at actual concurrency 8**,
with **2,624 actual operations followed by no-business/session-effect or exact
owned-effect invariants**, 64 confirmed own listener/connection/queue cleanups,
no failed or substituted resource group and no burners.
One final-source native campaign used signed qualified **Edge 157.0.4341.42** and
the existing **Playwright 1.56.1**: **20 actual allowed and 22 actual denied**
browser observations across two **sequential** sessions. Both normal success and
the intentional post-open failure confirmed exact-own process, profile, artifact,
scratch and listener cleanup. There was no second campaign, fallback, counter
reset, shared-neighbor adoption or global-cleanliness claim.

`source-selection-v2.json` accounts for every current namespace file, including
the unchanged retained first `source-selection.json`. Its own exact
bytes are anchored externally by the private final freeze/result and, only after
the parent actually publishes, by the real Git blob/newHEAD. It is not internally
self-authenticating. Ordinary verification checks the explicit entire file set,
every declared raw/LF/CRLF digest, the public projections and the actual complete
closure proof before running all five current BDD test files.

Despite these behavioral proofs, the uncaptured full raw of the first ordinary
qualification preflight remains a provenance limitation. The handoff does not
silently waive it or claim original acceptance/Done credit.

The first final transport attempt encountered Git's child-process 1 MiB output
buffer on a real 3.7 MiB projection; this is a retained tooling `ENOBUFS`, not a
behavioral RED. A following report-read diagnostic naturally failed `ENOENT`
because that attempt had not produced a report. Its tool transcript is retained,
but it was not redirected as an original raw file. The corrected transport
tool has a bounded 256 MiB buffer and records its exclusively created fixture
root identity before work. The original source head and failed tool preimages
remain immutable; the current second head adds, rather than repins, that history.

## Limits

One IPv4 loopback Node 22.23.4 listener, built-ins only, no installation or cloud
activity. C009 supplies the real per-connection lanes, refusal/read-stop path and
Node-own error responses. Only HTTP/1.x is served; CONNECT, Upgrade, h2c and parser
errors fail closed. No TLS/HTTP2 service, persistence, distributed authorization,
latency SLA or long-term memory claim is made. Accepted inherited bounds are
256 connections, four lane entries, 4096-byte bodies, 5-second request/header
checks with a 1-second check interval, and 8-second idle timeout.
