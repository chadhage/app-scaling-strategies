Feature: S022 dependency-aware readiness
  A-S022 is one Kano S unit in SC-S022, under D-S022.
  Training rehearsal - synthetic data - not a live Azure result
  Connectivity observations are deterministic local fixtures, not Azure probes.
  Database, messaging and service are always required.
  The named workload policy makes cache required or optional with a declared
  database fallback; the operator cannot make a required database optional.

  Background:
    Given the candidate is "candidate-v2"
    And the synthetic clock is 120000 ms and evidence is fresh through age 30000 ms
    And the protected existing synthetic capacity is 4 of 4
    And no user journeys, network calls or live transitions have occurred

  Scenario: All required connectivity checks succeed
    Given the cache-optional policy and four connected dependencies
    When I predict ADMIT and check readiness
    Then readiness is SUCCESS and the permitted decision is ADMIT
    And the verifier is PASS with 4 successful, 0 failed and 0 unknown checks
    And 3 of 3 required checks succeed
    And user-impact evidence remains UNMEASURED, not a 0-of-0 success

  Scenario Outline: A disconnected required dependency blocks admission
    Given the cache-optional policy and "<dependency>" is disconnected
    When I predict HOLD and check readiness
    Then readiness is FAILURE and the permitted decision is HOLD
    And the verifier is PASS with 3 successful, 1 failed and 0 unknown checks
    And protected existing synthetic capacity remains 4 of 4
    Examples:
      | dependency |
      | database   |
      | messaging  |
      | service    |

  Scenario: An optional cache outage must not blindly eject healthy capacity
    Given the cache-optional policy and cache is disconnected
    And required database connectivity satisfies the declared fallback
    When I predict ADMIT and check readiness
    Then readiness is SUCCESS with optional degradation explicitly reported
    And the failed cache check stays visible as 1 failure, not a success
    And 3 of 3 required checks succeed and protected capacity remains 4 of 4

  Scenario: The same cache outage is gating under a different declared workload
    Given the cache-required policy and cache is disconnected
    When I predict HOLD and check readiness
    Then readiness is FAILURE and 3 of 4 required checks succeed
    And the verifier is PASS without claiming a successful transition

  Scenario Outline: Unknown required connectivity never becomes success
    Given the cache-optional policy and database evidence is "<condition>"
    When I predict HOLD and check readiness
    Then readiness is UNKNOWN and the permitted decision is HOLD
    And 3 checks succeed and 1 is unknown
    And the trace identifies "<condition>" without silently using a healthy default
    Examples:
      | condition |
      | unknown   |
      | missing   |
      | stale     |

  Scenario: Optional uncertainty is visible without a blanket veto
    Given the cache-optional policy and cache evidence is unknown
    When I predict ADMIT and check readiness
    Then readiness is SUCCESS and the permitted decision is ADMIT
    And 1 unknown check and the fallback assumption remain visible

  Scenario: An incorrect operator answer cannot bypass the gate
    Given the cache-optional policy and messaging is disconnected
    When I predict ADMIT and check readiness
    Then the verifier is FAIL but the permitted decision remains HOLD
    And no synthetic or live traffic has been admitted

  Scenario: Settings changes invalidate the current result but retain history
    Given a checked FAILURE run followed by a checked UNKNOWN run
    When I change a dependency condition
    Then the current result is not checked
    And both earlier configurations, counts, verdicts and traces remain intact
    And at most 8 checked runs can be retained
    And a ninth check is rejected without evicting or mutating any earlier run

  Scenario: Malformed input and forged state fail closed
    Given a malformed policy, unknown condition, absent dependency or forged history
    When I attempt a configuration change or readiness check
    Then a specific validation error is raised without mutating retained state
    And the browser shows an accessible error instead of reusing a stale PASS

  Scenario: Keyboard operation and reset recover the whole local exercise
    Given I have changed controls and retained failure and unknown results
    When I use only the keyboard to choose a policy, condition and prediction
    Then I can submit and inspect the announced result
    When I activate Reset exercise
    Then the default controls and unchecked result return
    And retained history and errors are cleared and focus returns to the first control
    And native form reset has not been shadowed by a control named reset

  Scenario: The actual browser enforces the offline lesson boundary
    Given the lesson has local external scripts and styles under a restrictive CSP
    When inline script, inline handlers and a connection are attempted
    Then CSP blocks them without making a network request
    And ordinary lesson interactions still work without page errors
    And browser checks use the published isolated helper and await close in finally
