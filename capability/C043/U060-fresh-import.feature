@U060 @C043 @tooling-only @fresh @line-endings
Feature: Recompute both accepted import byte forms without repinning a producer
  The full LF replay exposed a stale comparison to a CRLF accepted blob.
  Producer bytes, imports.json, old captures and D1-D8 remain immutable.

  Scenario: A canonical LF checkout is the same accepted CRLF source
    Given the retained surface verifier and six hermetic accepted Git blobs
    And an accepted blob uses CRLF while its working fixture uses LF
    And both normalize to identical bytes
    When the actual retained import assertion runs
    Then it accepts the working fixture against the recomputed canonical blob
    And the old raw-only accepted-blob comparison fails this assertion
    And the assertion RED is archived before the verifier changes

  Scenario: Accepted metadata cannot authorize code drift
    When either working code, the accepted blob pin or the recorded canonical pin changes
    Then the verifier rejects it by a named assertion
    And canonical pins are recomputed from the accepted Git blob, never trusted
    And both unmodified raw and LF/CRLF working forms remain accepted

  Scenario: The exact complete fresh gates are replayed
    When the repaired verifier and unchanged oracle pass
    Then a new exact append-only authority preserves every D1-D8 byte
    And the complete current and both actual LF/CRLF test inventories pass
    And no producer file, qualification or application permission changes
