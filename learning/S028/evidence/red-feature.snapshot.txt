Feature: Explicitly abort timed-out preparation without calling it a migration
  # S028 / D-S028 / A-S028; frozen S; SC-S028; SOURCE; synthetic only.
  Background:
    Given the routing command is existing production 100 percent and candidate 0 percent
    And elapsed time advances only when the operator requests one synthetic second
    And no action promotes a candidate or executes a user migration

  Scenario: A warm-up deadline expires before readiness
    Given a timeout of 3 seconds and readiness after 5 seconds
    And observed production routing is unchanged and production receipts succeed
    When I start preparation and advance 3 synthetic seconds
    Then preparation is explicitly aborted with WARM_UP_TIMEOUT
    And the candidate is ineligible and the production routing command is unchanged
    And verification succeeds for a safe abort before exposure
    And attempted and completed migrations are both zero

  Scenario: Timeout wins the exact deadline boundary
    Given a timeout of 3 seconds and readiness after 3 seconds
    When I start preparation and advance 3 synthetic seconds
    Then the timeout aborts preparation instead of making the candidate eligible

  Scenario: The operator aborts preparation early
    Given preparation is warming
    When I activate Abort preparation
    Then preparation is aborted immediately with OPERATOR_ABORT
    And no later advance or restart can mutate that run

  Scenario: Early readiness is preparation, not migration
    Given a timeout of 4 seconds and readiness after 2 seconds
    When I start preparation and advance 2 synthetic seconds
    Then the candidate is ready but production routing is still 100 percent
    And the user migration outcome is unverified with zero completed migrations

  Scenario Outline: Observe continuity rather than assuming it
    Given the production routing witness is <routing>
    And the production receipt witness is <receipt>
    When the warm-up deadline aborts preparation
    Then the verification verdict is <verdict>
    And the full observation trace and failed or unknown receipts are retained
    And no completed migration is reported

    Examples:
      | routing | receipt | verdict |
      | intact  | success | success |
      | drift   | success | failure |
      | intact  | failure | failure |
      | missing | success | unknown |
      | intact  | unknown | unknown |

  Scenario: Reject invalid inputs and impossible state atomically
    When inputs contain fractions, non-finite numbers, strings, unknown enums or extra fields
    Or actions are out of order or a current or archived state is malformed
    Then the operation fails without changing state or history

  Scenario: Archive and reset without erasing evidence
    Given a nonempty run, including a run still warming
    When I activate Archive and reset
    Then a warming run is explicitly aborted before archival
    And the complete inputs, actions, trace and results remain in page-memory history
    And the controls reset and keyboard focus returns to the timeout input
    And only 3 archived runs are retained with explicit counted eviction
    And empty resets consume neither a run identifier nor history

  Scenario: Keyboard, errors and CSP remain usable offline
    Given the exact training banner and local-only script and style files
    When I use the keyboard to start, advance, abort and reset
    Then results and focused validation errors are accessible
    And native form.reset remains a callable function
    And inline script, inline handlers and external connections are blocked by CSP
    And ordinary verification cannot overwrite captured proof
