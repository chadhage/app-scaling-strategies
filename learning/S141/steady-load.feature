Feature: Inspect affected original journeys under a fixed synthetic steady-load trace
  All workload, requests, routing, versions, transitions, journeys, errors,
  budgets and correlation records are fictional teaching data, not live operations.

  Scenario: Complete original journeys prove the fictional continuity claim
    Given four one-second windows each contain 250 fictional requests
    And four original journeys overlap two recorded transitions
    When I conduct the positive trace, inspect it, and measure it
    Then request throughput is 1000 / 4 = 250 requests per simulated second
    And four of four affected original journeys complete without interruption
    And each original completes within 1200 ms and observes v1 then v2
    And two of two started affected transitions satisfy the zero-failure threshold

  Scenario: Successful unrelated requests and later recovery cannot hide interruption
    Given every one of 1000 fictional requests has HTTP status 200
    And original J2 is interrupted and finishes after its original deadline
    And a later successful new attempt belongs to J2 but has a different attempt ID
    When I measure the interrupted trace
    Then the original denominator is four, with three successful and one failed
    And J2's interruption is retained even after completion and the new attempt
    And the affected transition denominator is two, with one failed
    And routing percentages, HTTP 200 and throughput do not establish continuity

  Scenario: Started unknown originals and transitions remain in the denominator
    Given J4 started but its original terminal and target-version evidence are missing
    And its new attempt succeeds
    When I measure the unknown trace
    Then the original denominator is four, with three successful and one unknown
    And the transition denominator is two, with one successful and one unknown
    And the open original's elapsed age violates its 1200 ms budget
    And the result is UNKNOWN, not a continuity pass or five-nines certification

  Scenario: Inspection, measurement and immutable history are ordered and bounded
    Given no trace has been conducted
    Then inspection and measurement are rejected
    When I complete a negative run followed by a positive run
    Then both outcomes remain visible and the negative original is not repaired
    And altered derived state, altered event history, extra keys and untyped actions are rejected
    And at most six runs can be conducted before an explicit reset

  Scenario: A keyboard learner can recover from an invalid selection and reset
    Given the standalone page has the exact synthetic rehearsal banner
    When I conduct, inspect and measure using the keyboard
    Then the trace identities, denominators, budgets and outcomes are in the actual DOM
    When an invalid preset is submitted
    Then an accessible focused error appears without changing valid history
    When I activate Reset lesson
    Then the initial controls and focus return and explicit reset clears the rehearsal history

  Scenario: Local-only lesson and read-only verification
    Given the page has no network, storage, credentials, cloud calls or load generator
    Then CSP blocks inline scripts, data scripts and data connections
    And normal tests do not change owned bytes
    And only exact CAPTURE_BROWSER_EVIDENCE=1 captures uniquely named raw browser proof
    And raw behavioral RED and stub snapshots cannot be autodiscovered as tests
    And this lesson does not complete B-S141 or D-S141
