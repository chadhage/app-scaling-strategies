# U054 addendum 2: new metadata also needs its Git checkout forms

This append-only correction supersedes only the root-addendum hashing detail
in `U054.md`. Addendum 1 is retained byte-exact. The original C041
`.gitattributes`, all accepted seals and all original evidence remain unchanged.

The actual inherited Git rule is `text: set`, `eol: crlf` for the newly added
root JSON indexes. The first private prototype verified the new index's raw LF
bytes only. Its retained CRLF-metadata RED failed one named `ERR_ASSERTION`:
`TRUSTED_ADDENDUM_CHANGED evidence-index-addendum-1.json`. It was not a setup
failure. The exact test is replayed unchanged on the two-index implementation.

Only these **new amendment JSON indexes** use CRLF-to-LF canonical identity.
Their original LF raw hashes remain the chain-link values in the legacy
`previous.rawSha256` field; this is also their canonical hash. The current head
additionally reports its actual raw and canonical hashes. Independent literal
pins in `tests\u054-authority.test.cjs` check both indexes, including every
otherwise unused digest field. A changed non-EOL byte in either index is
refused by that index's name. LF/CRLF conversion is not applied to historical
raw output, original manifests, predecessor witnesses or old evidence.

Addendum 2 supersedes exactly the first proposal's authority helper and its
coupled evidence-test pin, retaining both exact predecessor witnesses. It adds
the new metadata RED projection and new EOL-specific tests. The production
catalog and host are unchanged from the genuine 44-case asset GREEN.

The acyclic trust-anchor test is outside both indexes; the final private source
freeze and parent's exact proposed application scope pin its final bytes.
Consistent malicious replacement of every verifier and anchor is still outside
self-contained hash protection. No C059 or C045 bridge authority is implied.

The fresh CRLF tree explicitly materializes the **new** root amendment metadata
as CRLF as the inherited Git attributes require; the fresh LF tree uses LF.
Both preserve original historical metadata raw. This correction was made before
the final source freeze; the first successful prototype and failed metadata
attempt remain separate retained history.
