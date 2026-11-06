Feature: C019 dependency provenance covers exactly the 161 accepted dependency files
  Training rehearsal - synthetic data - not a live Azure result
  Zero-credit repair U021. It changes test tooling only. Runtime, error codes, actions, C015, retained RED and
  every sealed byte stay unchanged. The sealed evidence-index.json is never rewritten: the accepted list is
  pinned in the append-only addendum evidence-index-addendum-1.json, chained to it by an LF-canonical hash.

  Scenario: The verifier hashes the accepted files and nothing else
    Given the 161 accepted dependency files of C001, C002 and C015 plus the published isolated browser helper
    When tests\provenance.cjs computes the dependency digests
    Then exactly those 161 listed files are hashed, in the pinned order
    And the list equals the preservation.dependencies record of the sealed F6 authorization snapshot
    And a new file anywhere under capability\C001, C002 or C015 is not hashed and changes no digest

  Scenario: A worker adds files under C015 while a C019 verifier runs
    Given a verifier that already took its before snapshot
    When another worker adds a new file under capability\C015 in the middle of the run
    Then verify.cjs stays green and still reports 161 unchanged dependency files

  Scenario: A listed byte or a listed file still trips the verifier
    Given a verifier that already took its before snapshot
    When one byte of a listed file changes in the middle of the run
    Then verify.cjs fails with the dependency bytes must remain unchanged assertion
    When a listed file is removed in the middle of the run
    Then verify.cjs fails and names no success

  Scenario: A private scratch folder is not part of the own-source inventory
    Given a test-scratch folder at the root of capability\C019
    When the verifier snapshots the namespace before and after a run
    Then the folder is not inventoried, so concurrent verifier runs and the fixtures of tests cannot trip each other

  Scenario: The pinned list is append-only
    Given evidence-index.json and numbered addenda evidence-index-addendum-N.json
    When the chain is read
    Then the numbers are consecutive from 1 and each addendum names its predecessor and its LF-canonical SHA-256
    And a gap, a wrong predecessor hash, a path outside the accepted roots, a traversal segment or an absolute path fails closed
    And a later addendum may add listed files but never remove or re-pin one
