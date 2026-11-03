Feature: S018 independent tier scaling in a bounded synthetic rehearsal
  # A-S018 / D-S018 / SC-S018; one frozen S unit, not native Azure evidence.
  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And ten synthetic journeys cross frontend, API and worker in one observation window
    And the selected constrained tier handles six journeys per ready instance
    And each other tier handles twelve journeys per ready instance
    And all instances are assumed ready and contracts are compatible unless deliberately broken
    And each API and worker instance fills four synthetic database connections
    And the database limit is twelve connections and the journey budget is 150 ms

  Scenario Outline: Scale only the constrained tier
    Given "<tier>" is the selected bottleneck and every tier has one instance
    When I change only "<tier>" to two instances and observe complete evidence
    Then the other two tier counts remain one
    And ten journeys succeed at 100 ms within the unchanged downstream limits
    And the observation and cumulative result are PASS
    Examples:
      | tier     |
      | frontend |
      | api      |
      | worker   |

  Scenario: A wrong-tier change does not fix a bottleneck
    Given API is constrained and every tier has one instance
    When I scale only frontend to two instances and observe
    Then API still admits six journeys in the window
    And four journeys exceed the original 150 ms deadline
    And the result is FAIL rather than a capacity-success claim

  Scenario: Indiscriminate scaling transfers pressure downstream
    Given API is constrained and every tier has one instance
    When I scale every tier to two instances and observe
    Then the tier path can admit ten journeys
    But sixteen occupied database connections exceed the limit of twelve
    And four journeys fail synthetic connection acquisition
    And six journeys succeed and the result is FAIL

  Scenario: Correct targeting cannot waive other constraints
    Given API is constrained
    When I scale API alone to three instances and observe
    Then the unchanged worker and frontend do not grow
    But the database connection limit is exceeded and the result is FAIL

  Scenario: Compatible contracts are independently required
    Given the constrained tier alone has two instances
    When the observed tier contract is incompatible
    Then all ten journeys fail contract validation even at 100 ms
    And successful throughput alone cannot pass the rehearsal

  Scenario: Missing evidence is not success
    Given the constrained tier alone has two instances
    When downstream completion evidence is missing
    Then observed connections and maximum latency are unknown
    And zero journeys are verified successful and ten remain unknown
    And the result is UNKNOWN

  Scenario: Recovery does not rewrite a failure or unknown
    Given an earlier observation failed or had missing completion evidence
    When I correct the scaling and observe a successful window
    Then both observations remain inspectable
    And cumulative FAIL takes precedence over UNKNOWN and PASS
    And an earlier UNKNOWN cannot become cumulative PASS

  Scenario: Invalid commands and forged state are rejected atomically
    When a count is fractional, non-finite, textual, outside one to three, or has extra fields
    Or a tier, observation condition, action, archive, or replayed result is invalid
    Then a useful error is shown and the previous state and evidence remain unchanged

  Scenario: The exercise is finite and reset retains bounded history
    Given a run permits at most 24 commands and eight observations
    When either bound is reached
    Then another command or observation is rejected without changing evidence
    When I use the keyboard to archive and reset
    Then a fresh default API fixture has no observations and is NOT_RUN
    And up to six earlier runs retain their own commands, observations and cumulative results
    And reset never implies that earlier failures became successful

  Scenario: Browser operation is accessible, local and evidence-preserving
    Given a standalone file lesson with labeled controls, visible keyboard focus and local-only CSP
    When I configure, scale, observe, provoke an error and archive/reset using the actual browser
    Then semantic controls work and native form.reset remains callable
    And inline script and external network attempts are blocked by enforced CSP
    And no page error or completed external request occurs
    And ordinary verification does not add, remove or rewrite historical proof
    And only CAPTURE_BROWSER_EVIDENCE=1 deliberately appends new evidence
