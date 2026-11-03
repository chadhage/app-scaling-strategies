Feature: S113 planned regional evacuation, fixed fictional teaching DATA ONLY
  The original A-S113 satisfier belongs to D-S113 and packet SC-S113.
  No action is a resource, region, network, identity, state or writer operation.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And fictional region-amber and region-violet, four required capacity units
    And required committed checkpoint 42, required sessions and writer epoch 8
    And two authored journeys with a 120 ms budget

  Scenario: Measured prerequisites precede exclusive writer and traffic handoff
    When I begin the ready fixture
    Then all observed prerequisites are unknown and the source is retained
    When I read warm-capacity data and synchronized-state data
    And I check exclusive-writer handoff
    Then the fictional destination owns the only eligible writer
    And evacuation is not yet verified
    When I migrate fictional traffic
    Then both authored routes and journeys pass
    And only fixture-scoped evacuation is positive

  Scenario Outline: An unsafe prerequisite retains source ownership
    When I begin the <fixture> fixture
    And I read warm-capacity data and synchronized-state data
    And I check exclusive-writer handoff
    Then the <gate> gate is negative
    And migration is blocked without changing source ownership
    Examples:
      | fixture | gate     |
      | cold    | capacity |
      | stale   | state    |
      | split   | fence    |

  Scenario: Missing observations cannot certify evacuation
    When I begin the missing fixture and read every prerequisite
    Then missing capacity, state and fence values remain unknown, never zero or success
    And the source owner and origin are retained
    And migration is unverified, not a simulated regional success

  Scenario: Exclusive ownership is not complete traffic convergence
    When I complete the route-lag fixture
    Then exclusive writer ownership passes but a sampled source route remains
    And evacuation is negative even though both journeys succeed
    And the old read-only source origin is retained

  Scenario: Converged routes cannot hide a failed mutating journey
    When I complete the journey-failure fixture
    Then capacity, state, writer and route observations pass
    But one authored journey is interrupted and commits zero effects
    And evacuation is negative without automatically restoring a fenced source writer

  Scenario: Typed input and action-order guards preserve state and history
    When an action has malformed types, extra fields, an unknown fixture or a forged state
    Or a handoff or migration is attempted out of order
    Then a focused error is shown without any state or history mutation

  Scenario: Earlier positive, negative and unknown evidence survives bounded runs
    When I conduct the seven fixed fixtures
    Then earlier outcomes are retained in at most 35 events
    And an eighth run is refused until explicit reset

  Scenario: Actual browser keyboard, reset and content security policy
    When I use only the keyboard to conduct a guarded handoff and evacuation
    Then controls, status and retained history are accessible
    And reset clears only in-memory teaching data and returns focus to the fixture
    And the native form reset method is not shadowed
    And inline script, dynamic evaluation and connections are denied by CSP
    And normal verification does not rewrite any lesson or evidence bytes
