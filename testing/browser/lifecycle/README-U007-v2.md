# U007 V2: revalidate after awaited scans

The parent's unchanged two-case regression exposed a real destructive-identity
race in V1: a root or recorded ancestor could change during `readDir`, between
the initial identity check and removal. V1 failed both named assertions. Six
additional pre-correction REDs cover descendant scans, disappeared roots,
remaining-path scans and retry boundaries.

V2 retains the original exclusive-creation provenance, attempt cap, backoff and
single original budget. After each awaited scan it revalidates the recorded root
and ancestry. The pre-removal path checks the original remaining budget both
before revalidation (preserving scan-expiry semantics) and immediately before
recording a destructive attempt. A missing root confirms absence; a replaced
identity refuses removal and remains reported.

This closes the demonstrated await boundary, not a kernel-atomic filesystem
transaction. The existing same-user TOCTOU and synchronous-adapter limitations
remain. No global filesystem atomicity is claimed.

## Immutable history and honest source versions

The original U007 candidate, V1 final candidate/result, every historical RED and
all 2,213 original mutation outcomes remain read-only history. V2 changes the
owned `scratch.cjs` source; it does **not** claim all 185 original files match V2.
`scratch-session.cjs` is unchanged but is measured again with its changed import.
All 514 accepted baseline files, including READMEs, readers, imports and pins,
remain byte-exact.

One owned mutation oracle used a root-read counter to inject a *confirmation*
fault. The required new read invalidated that fixture assumption. V2 triggers
the same fault only after removal is actually issued; every existing expected
error, phase, attempt count and confirmation assertion is unchanged. The failed
control and original fixture bytes remain retained.

## Append-only current authority

The new base/head preserve the previous V1 head and four exact owned predecessor
sources. The original V1 checker is replayed over its explicitly recorded
753-file byte/namespace epoch; that is historical verification, **not** a native
filesystem observation. V2 separately checks every actual current file and
rejects unlisted additions. Two owned verifier bootstraps select the new checker;
their behavioral assertions are unchanged.

The original 2,213 semantic mutation tuples are matched by explicit insertion
offsets only, with unchanged replacements. All are executed afresh on V2 along
with 23 newly enumerated variants and two explicit deletion-of-revalidation
counterfactuals. A survivor needs a new source-bound paired witness, never old
equivalence credit or a timeout relabel.

Exact command/stdio/input receipts, current full-file coverage, native-enabled
current/LF/CRLF replays, native identities/profiles, cleanup and privacy checks
are recorded by the new private result. No historical failed capture becomes
current proof. Final receipts are captured after the final source edit.

All actual browser scopes use the unchanged accepted sealed helpers and current
qualified policy; no policy append, framework installation, identity change or
expenditure is authorized. Shared runtime neighbors remain preserve-only, not
globally clean. This private candidate grants no application, publication,
qualification acceptance, Done or credit; the parent owns those decisions.
