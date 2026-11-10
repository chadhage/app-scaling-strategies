# U054 addendum 3: retain the original policy test's raw source witness

The fully source-LF fresh tree exposed one further genuine assertion in the
original C041 evidence test: 118 tests ran, 117 passed, and the historical
policy-test input check failed because the current policy source had LF while
its original RED correctly pinned CRLF. The failed run is retained as
`evidence\u054\final-lf-02`; its expected success was **not** observed. This is
not a setup failure or a GREEN result.

The original RED manifest and original raw output remain unchanged. A new
byte-exact `policy-test-original.snapshot` retains the actual original input,
whose raw hash must still equal the recorded input hash. The current policy
test must have precisely the same CRLF-to-LF source bytes as that raw witness.
The existing current-authority check separately verifies its exact approved
source pair. No historical raw file is normalized or silently repinned.

Addendum 3 names the exact evidence-test and authority-helper predecessors and
the EOL-verification test's predecessor. The latter now checks every present
index rather than incorrectly hard-coding two. All three current index hashes
are independently pinned in the acyclic trust-anchor test. Addenda 1 and 2,
their witnesses, both prior prototypes and all failed attempts remain intact.
The production host and catalog have not changed during these provenance
refinements.

The real accepted C059 and C045 producer-pin refusals are separate unresolved
authority gaps, not exceptions to this C041 chain. Nothing in this amendment
grants cross-namespace, application, publication or Done authority.
