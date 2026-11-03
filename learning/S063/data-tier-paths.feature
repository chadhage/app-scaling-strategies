Feature: Compare database resize and parallel-capacity paths honestly
  This is A-S063, one frozen S unit in SC-S063, from S063 and D-S063.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given only fixed synthetic capability and transaction fixtures
    And three synthetic transactions, bounded integer budgets and six retained runs
    And no Azure, database, authentication, deployment or infrastructure access

  Scenario: Compare two supported fixture paths inside the declared budgets
    Given the bounded-resize fixture and synchronized parallel capacity
    And reconnect and transaction-recovery budgets of 600 and 800 milliseconds
    When I compare in-place resize with parallel-capacity failover
    Then both synthetic paths pass their measured budgets and recover all three transactions
    And neither result qualifies a native platform operation

  Scenario: A restart-required resize is not online even with generous budgets
    Given the restart-required fixture and synchronized parallel capacity
    When I compare paths with budgets of 5000 milliseconds
    Then the in-place path fails with NOT ONLINE
    And the supported synthetic parallel path may pass
    And raising a budget cannot convert a disruptive operation into an online guarantee

  Scenario: Parallel capacity must be separately supported and ready
    Given the parallel-unavailable fixture or an unsynchronized parallel destination
    When I compare paths
    Then the parallel handoff is blocked and fails
    And no reconnect or transaction-recovery observations are fabricated for that blocked path

  Scenario: Missing evidence and unresolved transaction outcomes remain unknown
    Given unverified capability, unknown readiness, missing timing evidence or an unresolved transaction
    When I compare paths without another known failure
    Then the affected result is UNKNOWN, not passed
    And an unresolved transaction remains in the three-started denominator

  Scenario: A known failure dominates uncertainty
    Given a failed transaction or a measured reconnect above its budget
    And some other observation is unknown
    When I compare paths
    Then the affected result is FAILED with its reasons and user impact retained

  Scenario: Exact budget boundaries are inclusive
    Given the bounded-resize fixture reconnect of 420 and recovery of 560 milliseconds
    When budgets equal those measurements
    Then the in-place path passes
    But a budget one millisecond lower fails its corresponding check

  Scenario: Invalid inputs, forged state and history overflow cannot change prior results
    Given a valid immutable run history
    When an extra field, invalid enum, non-integer budget, altered result or seventh run is submitted
    Then an explicit error preserves every previous run
    And only an explicit reset or page reload clears the in-memory history

  Scenario: Actual browser keyboard, failure, error, reset and CSP behavior
    Given the standalone lesson and the exact training banner
    When I use only keyboard controls to compare paths and reset
    Then both the selected trace and comparison are visible and history is retained
    And invalid input focuses its control and a disruptive result is visibly FAILED
    And reset restores defaults, clears history and returns focus to the path control
    And inline script, dynamic evaluation and external connections are blocked by CSP
    And normal verification never rewrites retained proof
