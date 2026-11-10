# U034: fresh installed-major qualification

The existing qualification tool ran the real isolated suite (8/8) and loopback suite
(5/5) on Microsoft-signed Edge `157.0.4341.42`. Neither suite skipped, cancelled, or
marked a test todo. The path, version, SHA-256, and Microsoft signature were stable.
The expected pre-append CLI verdict was exit 1, solely `MAJOR_NOT_QUALIFIED`.

The existing addendum CLI checked the **fresh original report**, dry-ran it, and
appended major 157 exactly once. Its chain check and the actual current API passed.
The sealed list remains `[156]`; the seven qualification implementation files were
not edited. The retained admission assertions failed genuinely before the append
and passed unchanged afterwards: 157 admitted, unknown 158 still denied.

## Evidence and limits

- `U034.feature` is the behavioral specification for this continuation.
- `*-report.public.json` are **explicit portable projections**, not append authority.
  Only the absent per-user Edge candidate prefix is replaced by `<LOCALAPPDATA>`.
  Each records the digest of the unchanged original private report and stdout.
- `commands.public.json` and `records/*.portable.txt` are explicitly projected
  wrapper outputs. They identify original raw hashes separately from projected
  hashes. Private path and session identifiers are replaced with visible markers;
  the original private stdout, stderr, gzip records, input hashes, and manifests
  remain unchanged. A projected command containing markers is not executable text.
- `summary.json` records actual adopter outcomes, cleanup, namespace-suite results,
  and the frozen-byte proof. A failed or timed-out adopter is **not** a qualification
  completion claim; consult those outcomes rather than inferring success here.

The actual U005 and U006 reader files each contain three real cases. Their separate
midpoint evidence records execution, completion, cleanup, and pending-rerun facts.
X001 has its own reader callback. Those callbacks do not grant permission to apply
lifecycle or X001 changes. Adopter source and historical captures are read-only;
`CAPTURE_BROWSER_EVIDENCE` remains absent.

No Azure, deployment, identity, expenditure, package-installation, live-application,
publication, or Done authority is established. The parent independently reviews
all gates and alone decides publication under the existing U018 scope.
