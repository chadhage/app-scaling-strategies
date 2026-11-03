Feature: S072 cold-cache refill pressure
  Training rehearsal - synthetic data - not a live Azure result
  Source: README S072, D-S072, A-S072; packet SC-S072; frozen Kano S.

  Background:
    Given all synthetic requests arrive at virtual time zero with a cold cache
    And a database accepts at most 2 simultaneous refills taking 40 milliseconds
    And each journey retains its original 100 millisecond budget with no retries

  Scenario: Unbounded same-key refill produces a counted stampede
    When 8 requests for 1 cold key each start their own refill
    Then 8 database refills are attempted and 6 are rejected for overload
    And 2 journeys succeed and 6 fail in the original denominator of 8
    And the result identifies a database-overloading stampede

  Scenario: Coalescing shares the same-key refill
    When the same burst coalesces requests by key
    Then 1 database refill serves all 8 journeys in 40 milliseconds
    And all 8 journeys succeed without claiming any native Azure result
    And the earlier run and its 6 failures remain in session history

  Scenario: Coalescing alone does not bound different-key pressure
    When 8 requests for 4 keys coalesce without a refill bound
    Then 4 database refills are attempted and 2 are rejected
    And 4 affected journeys remain failures

  Scenario: Bounded coalescing can still miss a journey deadline
    Given 8 requests for 4 keys and a refill limit of 1
    And the original journey budget is 80 milliseconds
    When coalesced refills use the bounded queue
    Then no database query is overloaded
    But only 4 journeys succeed and 4 fail their latency budget
    And the maximum completion latency is 160 milliseconds

  Scenario: Missing evidence is not success and cannot erase known failures
    When the final otherwise-successful journey has no latency observation
    Then that journey is unknown and remains in the denominator
    And any known overload or deadline failures remain failures
    And a complete later run does not rewrite previous results

  Scenario: Invalid commands do not change retained results
    When a value is non-integer, out of range, unknown, or inconsistent
    Or a stale or fabricated session is submitted
    Then the command is rejected without adding or changing a run
    And a session holds at most 12 runs until explicit reset

  Scenario: Keyboard operation, error recovery, and reset
    Given the standalone lesson is opened with its restrictive CSP
    When an operator uses Tab, Enter, and Space for the core controls
    Then burst results, load, latency, failures, and unknowns are visible
    And invalid input has an announced error and focus without losing history
    And reset restores defaults, clears only this session, and focuses strategy
    And inline script and connection attempts are blocked by CSP
