Feature: S051 already-open old frontend consuming a new API
  A-S051 / D-S051 / frozen S / SC-S051 / worker-A-S051
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given an already-open synthetic frontend v1 consumes id, displayName and unreadCount
    And its fixed baseline renders "Synthetic learner — 1 unread"
    And three synthetic journeys still request the same /api/profile contract
    And no network, authentication, deployment or cloud operation is performed

  Scenario: An additive new API preserves the old frontend contract
    Given the new API keeps all consumed fields and adds an ignored theme field
    When the operator opens the old page then runs all three candidate journeys
    Then all three HTTP-200 fixture responses render their expected values
    And the compatibility gate is PASS with uninterrupted synthetic impact
    And the old frontend remains version v1

  Scenario: HTTP 200 cannot disguise a renamed consumed field
    Given the new API replaces displayName with profile.name
    When the operator runs all three candidate journeys
    Then all three responses have HTTP 200 but the old renderer rejects them
    And the compatibility gate is FAIL with interrupted synthetic impact
    And the missing displayName and received response shapes are visible

  Scenario Outline: Incomplete observations do not manufacture correctness
    Given the new API uses <response> responses
    And the observation is <observation>
    When the operator runs the candidate journeys
    Then observed render successes are <passed> and render failures are <failed>
    And unobserved journeys are <unknown>
    And the compatibility gate is <gate> with <impact> synthetic impact

    Examples:
      | response   | observation | passed | failed | unknown | gate    | impact        |
      | compatible | partial     | 1      | 0      | 2       | UNKNOWN | unknown       |
      | compatible | none        | 0      | 0      | 3       | UNKNOWN | unknown       |
      | breaking   | partial     | 0      | 1      | 2       | FAIL    | interrupted   |
      | breaking   | none        | 0      | 0      | 3       | UNKNOWN | unknown       |

  Scenario: A correct prediction of interruption is not successful user impact
    Given a breaking response has failed the compatibility gate
    When the operator predicts interrupted impact
    Then the prediction verifier is PASS
    But the gate remains FAIL and synthetic user impact remains interrupted

  Scenario: Inputs and state cannot be coerced or bypassed
    Given only the exact response and observation enum fields are permitted
    Then missing, extra, inherited, accessor, symbolic and invalid enum inputs are rejected
    And running before opening, running twice and replacing locked assumptions are rejected
    And rejected actions do not alter the previous model snapshot
    And returned snapshots cannot mutate private state

  Scenario: New attempts retain bounded evidence and clear stale current results
    Given a completed candidate result
    When the operator starts another attempt
    Then the previous assumptions, response measurements, gate and prediction remain in history
    And the current result, preview, prediction and trace are cleared
    And after eight completed attempts further attempts are blocked without eviction

  Scenario: Keyboard operation, explicit reset and offline CSP
    When the operator uses the keyboard to open, run and check a prediction
    Then focus follows the next available control and errors are announced
    When the operator resets with the keyboard
    Then defaults, idle phase, empty history, trace, prediction and focus are restored
    And the native form.reset function has not been shadowed
    And inline script execution and outbound connections are blocked by enforced CSP
