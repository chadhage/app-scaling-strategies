Feature: Representative journey warm-up (A-S023, D-S023, SC-S023; frozen Kano S)
  Training rehearsal - synthetic data - not a live Azure result
  Source S023: Exercise safe login, read, and transaction paths using isolated test fixtures.
  Preconditions: Local browser, fixture-v1, no accounts, network, management calls or external effects.
  A successful rehearsal is not native B-S023 proof or completion of D-S023.

  Scenario: A shallow probe misses a failing transaction
    Given the isolated transaction-rejected fixture and a 150 ms journey budget
    When the operator runs only the shallow endpoint probe
    Then the endpoint returns synthetic HTTP 200 in 10 ms
    And all three business assertions are unmeasured
    And readiness is unknown, not successful
    When the operator runs the representative login, read and transaction path
    Then login and the owned-profile read pass
    And the transaction is rejected with synthetic HTTP 409
    And readiness fails despite the same healthy endpoint
    And no fixture commit or external write is reported
    And both observations remain in history

  Scenario: All safe business assertions and the latency budget pass
    Given the isolated healthy fixture and the representative path
    When the journey budget is at least 100 ms
    Then the login identity, owned-profile read and isolated transaction receipt pass
    And the measured synthetic journey duration is 100 ms
    And exactly one fixture-only ledger marker is recorded
    And readiness succeeds for this rehearsal only
    And external writes are zero and existing-user exposure is not measured

  Scenario: A business path or latency budget fails
    Given a denied login, wrong profile owner, rejected transaction or a 99 ms budget
    When the representative path runs
    Then at least one required assertion or the latency budget fails
    And later steps after a login or read failure are explicitly not run
    And readiness fails, not an uninterrupted user transition

  Scenario: Missing evidence is unknown
    Given the transaction-unobserved fixture
    When the representative path runs
    Then login and read pass but the transaction receipt and latency are unknown
    And the fixture commit count is unknown, not zero
    And readiness remains unknown

  Scenario: Isolation is required before any execution
    Given isolation confirmation is unchecked
    When either check is requested
    Then the safety guard fails before the endpoint or business steps execute
    And fixture commits and external writes are zero

  Scenario: Invalid inputs and state do not mutate history
    Given an invalid mode, fixture, non-integer or out-of-range budget, or malformed history
    When a run is requested
    Then the request is rejected without coercion or partial state changes
    And an invalid UI request announces an error and focuses the error panel
    And the last valid result and retained history are unchanged

  Scenario: Bounded history and keyboard reset
    Given six completed observations including failures and unknowns
    When a seventh run is requested
    Then it is rejected and all six observations remain unchanged
    When the operator activates Reset lesson using the keyboard
    Then controls return to the shallow transaction-rejected fixture at 150 ms with isolation confirmed
    And history, error and result are cleared
    And focus returns to the check selector and reset is announced

  Scenario: Portable browser and CSP
    Given the local file lesson and only its owned scripts and stylesheet
    Then controls can be conducted with the keyboard without a server or framework
    And inline script execution and network connections are denied by the browser CSP
    And normal verification never rewrites committed proof
