Feature: S058 synthetic execution-history version matching
  Existing histories require the workflow definition selected by their recorded version.
  This portable model does not replay a real Durable Functions engine or storage provider.

  Background:
    Given three fixed synthetic histories started under versions 1.0 and 2.0
    And version 2.0 inserts RiskCheck before ReserveStock
    And replay comparison does not execute activities or create external effects

  Scenario: Exact pinning with retained workers preserves existing histories
    When the operator selects exact pinning with overlapping workers and complete history
    Then all 3 histories match their recorded command prefix
    And their next synthetic command is reported
    And the synthetic verifier is PASSED

  Scenario: An explicit version branch supports old histories on new code
    When only the version 2.0 worker remains
    And the operator selects explicit branching by immutable instance version
    Then old histories use the version 1.0 command sequence
    And all 3 histories permit modeled continuation

  Scenario: Latest code is not an implicit version migration
    When every history is compared with the latest unversioned command sequence
    Then one old history fails at its first divergent recorded command
    And the shorter old prefix is blocked because its next command would change
    And the version 2.0 history matches
    And no history is rewritten or silently restarted
    And the synthetic verifier is FAILED

  Scenario: A pin without its worker cannot continue
    When exact pinning is selected after the version 1.0 worker is removed
    Then 2 old histories are blocked
    And blocked work does not count as a successful continuation

  Scenario: A version label cannot repair incompatible history
    When a recorded old command is replaced by the incompatible ChargeCard fixture
    Then comparison detects the mismatching command even under an explicit version branch
    And the synthetic verifier is FAILED

  Scenario: Missing evidence remains unknown in the started denominator
    When the final history observation is missing
    Then that history is UNKNOWN and all 3 started histories remain in the denominator
    And an otherwise compatible comparison is UNKNOWN
    And a separate known mismatch still makes the overall verifier FAILED

  Scenario: Inputs and state are guarded without losing earlier results
    When an unknown option, malformed state, or a seventh comparison is submitted
    Then the comparison is rejected without changing the prior six attempts
    And earlier failures remain visible until an explicit reset

  Scenario: Standalone keyboard surface and truthful reset
    Given the exact banner "Training rehearsal - synthetic data - not a live Azure result"
    When the operator uses Tab, selection keys, Enter, and Reset
    Then controls, failures, focused errors, retained history, and restored defaults are usable
    And CSP blocks inline code, eval, and network connections
    And reset clears only the in-memory rehearsal
