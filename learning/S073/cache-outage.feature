Feature: A-S073 cache loss cannot turn an empty synthetic profile into success
  # D-S073; SC-S073; frozen S; one local learning unit.
  # All identities, profile contents, times and observations are synthetic.

  Background:
    Given the required profile is synthetic-profile-073 at revision 7
    And its label, theme and two saved item IDs must be preserved exactly
    And cache success takes 10 synthetic milliseconds
    And cache loss is observed after 20 synthetic milliseconds
    And the durable path adds 90 synthetic milliseconds
    And the declared budget is one of 80, 110 or 150 synthetic milliseconds

  Scenario: Empty fallback is an interruption, not success
    Given cache access is lost
    When the operator substitutes an empty profile
    Then the result is FAILURE with reason EMPTY_PROFILE
    And no successful required-state recovery is counted

  Scenario: Known correct durable state at the exact budget
    Given cache access is lost
    And the durable receipt contains the exact required profile
    When the operator selects durable recovery with a budget of 110
    Then the result is SUCCESS at 110 synthetic milliseconds
    And the trace shows cache loss followed by the durable receipt

  Scenario Outline: Incorrect or unavailable durable state fails explicitly
    Given cache access is lost
    When durable recovery observes <receipt>
    Then the result is FAILURE with reason <reason>
    Examples:
      | receipt     | reason                |
      | stale       | STALE_PROFILE         |
      | wrong       | WRONG_PROFILE         |
      | empty       | EMPTY_PROFILE         |
      | unavailable | DURABLE_UNAVAILABLE   |

  Scenario: Correct state after the budget is still a failure
    Given cache access is lost and the durable receipt is correct
    When durable recovery uses a budget of 80
    Then the result is FAILURE with reason BUDGET_EXCEEDED
    And the correct recovered profile remains visible

  Scenario: Missing evidence is not recovery proof
    Given cache access is lost
    When durable recovery has an unknown receipt within the budget
    Then the result is UNKNOWN with no fabricated profile
    But a measured 110 milliseconds against a budget of 80 is FAILURE

  Scenario: Fail closed is honest failure rather than an empty success
    Given cache access is lost
    When the operator selects explicit failure
    Then the result is FAILURE with reason EXPLICIT_FAILURE
    And no profile is fabricated

  Scenario: Missing cache observation cannot authorize a recovery claim
    Given the cache observation is unknown
    When the operator runs any recovery choice
    Then the result is UNKNOWN and no durable receipt is invented

  Scenario: The bounded exercise preserves checked and unchecked outcomes
    Given only supported enum values and exact numeric budgets are accepted
    When the operator runs, predicts and checks an attempt
    Then the actual SUCCESS, FAILURE or UNKNOWN is separate from prediction correctness
    And at most six attempts are retained without overwriting earlier traces
    And configuration changes, repeat runs and repeat checks are guarded
    And an explicit reset clears history, errors and predictions and restores defaults

  Scenario: A keyboard learner can safely inspect a real local DOM
    Given the exact training banner and native-proof limits are visible
    When the learner uses keyboard run, check, new attempt and reset
    Then focus, labels, live outcomes and visible errors support the workflow
    And reset does not shadow a form's native reset function
    And CSP blocks inline code, network connections, foreign scripts, frames and form submission
    And ordinary verification does not rewrite recorded evidence
