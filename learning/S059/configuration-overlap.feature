Feature: S059 shared configuration across old and new code
  # A-S059 / D-S059 / SC-S059 / frozen Kano S; synthetic learning only.
  Background:
    Given both synthetic deployments read the same "retryBudget" setting
    And the approved retries-v1 schema means extra retries after the first attempt
    And the synthetic dependency succeeds on attempt 3
    And retries-v1 values are integers from 0 through 4
    And attempts-v2 values are integers from 1 through 4
    And no setting is published before its exact draft passes inspection

  Scenario: Compatible shared setting is interpreted and published consistently
    Given retryBudget is 2 in retries-v1
    And new code preserves the approved legacy meaning
    When I inspect the draft
    Then both readers permit 3 total attempts
    And 2 synthetic journeys succeed with no failures or unknowns
    And the compatibility and publication verdicts are PASS
    When I publish the inspected draft
    Then that exact configuration is published

  Scenario: One shared value has divergent meanings
    Given retryBudget is 2 in retries-v1
    And new code reinterprets the value as total attempts
    When I inspect and attempt publication
    Then old code permits 3 attempts and new code permits 2
    And compatibility is FAIL and publication is blocked
    And 1 synthetic journey fails and the published configuration is unchanged

  Scenario: Healthy probes cannot hide divergent meanings
    Given retryBudget is 3 in retries-v1
    And new code reinterprets the value as total attempts
    When I inspect the draft
    Then both synthetic journeys succeed
    But the meanings still disagree and publication is blocked

  Scenario: A new schema is not supported by the old reader
    Given retryBudget is 3 in attempts-v2
    When I inspect and attempt publication
    Then old code explicitly rejects that schema
    And publication is blocked without pretending the old reader was migrated

  Scenario: Missing new-reader evidence is unknown
    Given retryBudget is 2 in retries-v1
    And the new reader observation is unavailable
    When I inspect and attempt publication
    Then 1 synthetic journey is unknown and none is inferred successful
    And compatibility and publication are UNKNOWN and publication is blocked

  Scenario: Consistent meanings do not guarantee a completed journey
    Given retryBudget is 1 in retries-v1
    And new code preserves the approved legacy meaning
    When I inspect the draft
    Then compatibility is PASS but both journeys fail before attempt 3
    And the overall verdict is FAIL and publication is blocked

  Scenario: An edit invalidates an earlier passing check
    Given a passing draft was inspected
    When I edit its value or reader or schema
    And attempt publication without inspecting the new draft
    Then publication is blocked as unchecked
    And earlier measured outcomes remain in history

  Scenario: Recovery cannot erase a measured failure
    Given a divergent configuration failed inspection and publication
    When I restore compatible code, inspect and publish
    Then the compatible publication succeeds
    And all earlier failure and blocked-publication records remain visible

  Scenario: Invalid inputs and forged states cannot change a publication
    Given a valid published configuration
    When I submit a non-integer, out-of-range, extra-field or unknown-enum input
    Or submit a malformed state or forged passing check
    Then the operation raises an explicit validation error without mutation

  Scenario: History is bounded without silently dropping evidence
    Given 16 measured actions are retained
    When I request another measured action
    Then it is refused until explicit reset
    And all 16 previous records remain unchanged

  Scenario: Keyboard, error, reset and browser boundaries are real
    Given the standalone lesson is opened with its restrictive CSP
    Then the exact synthetic training banner is visible
    And all operator controls have labels and keyboard focus
    When I inspect, publish, encounter an input error and explicitly reset using keys
    Then results and retained history are rendered from the model
    And invalid input is announced without changing measured state
    And reset restores defaults, clears only local history and focuses the schema control
    And inline script execution and network connections remain blocked
    And no native Azure, Node.js 24 production or distributed-configuration result is claimed
