Feature: Reconcile a synthetic controller restart without repeating destructive data events
  The console is an available browser UI, not a running controller.
  Every destructive transition is a DATA ONLY entry in a fixed teaching trace.
  The crash occurs after one retirement effect and before its checkpoint advances.
  Three declared synthetic user journeys always remain in the denominator.

  Scenario: Restore a completed effect from its durable receipt
    Given complete synthetic effect and user-outcome receipts
    When I stage the crash and restart with durable reconciliation
    Then the retirement effect has one execution and zero duplicate destructive actions
    And the stale checkpoint advances to COMPLETE without replay
    And all three user outcomes are restored or completed
    And the result is SUCCESS with the console available throughout

  Scenario: Unsafe resumption repeats destructive work
    Given the same stale checkpoint and complete receipts
    When I restart by unsafely replaying the checkpoint
    Then the same retirement identity appears twice in the data trace
    And one duplicate destructive action makes the result FAILURE
    And three successful user outcomes cannot conceal that failure

  Scenario: Missing effect receipt cannot authorize a replay
    Given a missing durable effect receipt
    When I restart with durable reconciliation
    Then no second destructive event is appended
    And progress is RECONCILE_REQUIRED, one journey is unresolved, and the result is UNKNOWN

  Scenario: A lost user receipt stays in the denominator
    Given a missing pre-crash user-outcome receipt
    When I restart with durable reconciliation
    Then two user journeys succeed and one remains UNKNOWN out of three attempted
    And a completed checkpoint does not make the result SUCCESS

  Scenario: A recorded user interruption survives recovery
    Given one recorded pre-crash user failure
    When I restart with either policy
    Then that failure remains counted and the result is FAILURE

  Scenario: Learner prediction is separate from the trace result
    Given an unsafe resumed trace with result FAILURE
    When I predict SUCCESS and check the attempt
    Then the prediction is incorrect and the result remains FAILURE
    And the configuration, full trace, metrics, and outcomes are retained

  Scenario: Exact inputs and ordered actions
    Given a fresh exercise
    Then restart, check, and new-attempt actions are rejected without state mutation
    And missing, extra, malformed, or unsupported configuration fields are rejected
    And only one crash staging, restart, and check is allowed per attempt

  Scenario: History is bounded without silently evicting evidence
    Given six checked attempts
    Then starting another attempt is rejected
    And all six full records remain available until explicit reset

  Scenario: Keyboard, error, and reset operation
    Given the lesson opened with the exact synthetic training banner
    When I use keyboard controls through a safe attempt and a new unsafe attempt
    Then both outcomes and their histories remain inspectable
    And a tampered input causes a visible alert without changing model state
    When I activate explicit reset
    Then configuration, prediction, trace, metrics, errors, and history return to defaults
    And focus returns to the first configuration control

  Scenario: Browser content policy
    Given the real lesson DOM with its enforced content security policy
    Then local scripts and styles work without unsafe flags
    And an actual inline-script probe and connection probe are blocked
    And there are no external requests or unexpected page errors
