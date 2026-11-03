Feature: Recover after fixed new-version writes without losing committed effects
  A-S098 is one SOURCE-gated satisfier in LP-COMPARE, not native B-S098 or X002.
  All ledger writes, readers and recovery actions are synthetic teaching data.

  Background:
    Given the exact S098 README row, D-S098 acceptance and portable A-card contract
    And the banner "Training rehearsal - synthetic data - not a live Azure result"
    And a fixed baseline reservation L001 of 6 units
    And fixed v2 effects L002 reserve 3 and L003 release 1
    And a 10 ms synthetic read budget and at most 12 recovery decisions

  Scenario: Compatible application rollback preserves and interprets new writes
    When the operator applies the fixed v2 writes and chooses compatible rollback
    And the complete synthetic observation reads L001, L002 and L003 correctly in 7 ms
    Then the result is SUCCESS with 3 retained and interpreted effects totaling 8 units
    And the effective teaching destination is v1-compatible, not the old 6-unit snapshot

  Scenario Outline: An unsafe reversal is rejected rather than deleting writes
    Given all three fixed effects are committed in the workbook
    When the operator chooses <plan>
    Then recovery is REJECTED before changing the effective v2 destination
    And the 3-effect ledger and its correct 8-unit total remain unchanged
    And rejection is a safe abort, not completed rollback

    Examples:
      | plan                   |
      | baseline-only v1 reader |
      | discard-new-writes      |

  Scenario: Explicit compatible forward recovery is not called v1 rollback
    Given all three fixed effects are committed in the workbook
    When the operator chooses forward recovery with complete observation
    Then the result is SUCCESS and the teaching destination is v2.1
    And every new effect remains individually interpretable and correct

  Scenario Outline: Stored data alone is not proof of correct reads
    Given all three fixed effects are committed in the workbook
    When a supported recovery receives <observation> observation
    Then the result is <outcome> and no unverified destination is exposed
    And the original ledger remains 3 effects totaling 8 units
    And the attempt remains in history and the attempted-recovery denominator

    Examples:
      | observation | outcome |
      | missing     | FAILURE |
      | corrupt     | FAILURE |
      | unknown     | UNKNOWN |

  Scenario: A correct learner answer does not turn failed recovery into success
    Given a failed synthetic read after new writes
    When the operator predicts FAILURE and checks the interpretation
    Then the learner verifier is PASS while recovery stays FAILURE

  Scenario: Invalid input, stale run and out-of-order actions are atomic errors
    When an unknown choice, malformed run token, stale run or premature action is delivered
    Then a visible focused error identifies the rejected command
    And no ledger, routing, history, denominator or prior decision changes

  Scenario: Keyboard reset retains failures and a bounded history
    Given successful, failed, unknown and rejected recovery decisions
    When the operator resets using the keyboard
    Then controls, baseline ledger and focus return to their declared defaults
    And all earlier decisions and outcome totals remain visible
    And the thirteenth recovery cannot be attempted, including after reset
    And a deliberate page reload is the only way to discard in-memory history

  Scenario: The standalone page enforces its content policy
    Then local external scripts and styles load without a server
    And inline script, evaluation, external image, connection and form submission are blocked
    And no real data, Azure resource, credential, deployment or production certification occurs
