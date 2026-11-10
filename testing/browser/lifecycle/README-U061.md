# U061: exact raw / LF historical provenance

Zero-credit verification repair for the two U005/U006 draft-RED stable-input
checks. This changes only their verifier copies and adds test tooling/data.
The original production files, retained specimens, historical captures, streams
and seals stay byte-exact.

## Root cause and allowed change

The original checks compare a current file's raw SHA-256 with a historical raw
SHA-256. A fresh LF checkout of the unchanged U004 source has the recorded
LF-canonical digest, not the Windows working-tree raw digest. U007's preserved
LF run therefore fails exactly those two assertions; that run remains failed.

The amended checks use an acyclic, pinned `tests\u006-u061-authority.cjs` helper.
`evidence\u061\authority-base.json` names all six original draft manifests,
their 15 stable input records and the exact original verifier snapshots.
The helper pins that base by SHA-256 and rechecks every original manifest,
recorded pair and retained raw input.

`authority-addendum-1.json` supersedes exactly
`tests\u005-evidence.test.cjs` and `tests\u006-evidence.test.cjs`. It records the
original and replacement raw/canonical pairs and the helper's exact bytes.
`authority-head-1.json` binds the addendum. A later head/addendum is a new file
linked to its predecessor; earlier files are not overwritten.

The first private full-suite capture found U006's closed import-ownership gate:
a helper outside its `u006-` file family would need a new historical import pin.
The current helper therefore follows the existing U006-owned naming convention.
Addendum/head 2 records the exact necessary verifier replacement and preserves
the first helper, first addendum/head and the failing capture. `imports.json`
is unchanged; the helper is independently pinned in both amended verifiers.

Addendum/head 3 fixes a separately archived caller-alias failure: validated
digest pairs are copied into the authority, so a caller cannot replace an
accepted pair by mutating the original parsed object. The exact predecessor
helper is retained; earlier addenda, heads and failure captures are unchanged.

An input passes only when its actual byte digest equals the original recorded
raw digest OR the original recorded LF-canonical digest. The checker does not
normalize arbitrary candidate bytes before accepting them: mixed line endings,
content changes and unrecorded paths fail.

## Reproducible checks

Run from the repository root with Node 22. `<SCRATCH>` is caller-owned private
storage, and each work child below must not already exist.

```powershell
# NEW behavioral RED on the retained raw-only control: 2 named canonical assertions fail.
$env:U061_IMPL = 'raw-only'
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\u061-red --implementation candidate --test --test-concurrency=1 --test-timeout=120000 testing\browser\lifecycle\tests\u061-provenance.test.cjs
Remove-Item Env:\U061_IMPL

# Same NEW behavioral tests, unchanged, plus authority/differential/tamper controls.
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\u061-green --implementation candidate --test --test-concurrency=1 --test-timeout=120000 testing\browser\lifecycle\tests\u061-provenance.test.cjs testing\browser\lifecycle\tests\u061-authority.test.cjs testing\browser\lifecycle\tests\u061-snapshot.test.cjs

# Both amended historical verifier suites.
node testing\browser\lifecycle\tests\u007-replay.cjs --work <SCRATCH>\u061-history --implementation candidate --test --test-concurrency=1 --test-timeout=120000 testing\browser\lifecycle\tests\u005-evidence.test.cjs testing\browser\lifecycle\tests\u006-evidence.test.cjs
```

The private result supplies the full raw/LF/CRLF namespace commands and immutable
capture paths. Use the existing `<RUN>\scripts\archive-run.cjs` recorder, fresh
capture names and the shared heavy slots. Nested Node runners remove
NODE_TEST_CONTEXT and NODE_V8_COVERAGE.

## Limits and authority

This is a consistency tripwire, not a signature: a coordinated rewrite of
verifiers, helper anchors and all authority data requires comparison with the
accepted Git objects by the independent coordinator/reviewer. It does not
authorize a different input, change historical failed outcomes, qualify Edge or
complete U007's mutation/browser work.

Every live lifecycle byte remains read-only in this private submission.
U034's U005 AND U006 reader executions are still unexecuted. Their eventual
completion signal is read coordination only; separate current-coordinator
application authorization after review is required.
