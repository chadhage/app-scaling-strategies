Feature: S011 manual horizontal scale-out, portable synthetic rehearsal
  # A-S011 / D-S011 / SC-S011; frozen Kano S; one original kanoUnit.
  # Source: README.md S011 and .docs/wiki/backlog.md D-S011.
  # D-S021 remains an original parent prerequisite, not a completed native claim.
  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And two initially ready, traffic-eligible synthetic instances
    And each instance has 50 requests/second capacity and a 20-connection pool
    And the declared training utilization ceiling is 80 percent
    And the synthetic journey budget is 800 milliseconds
    And readiness expires after 30 logical seconds
    And no Azure connection, credentials, resource, deployment, or production runtime is used

  Scenario: Requested, deployed, ready, and eligible are different observations
    When I request four instances for 160 requests/second with a 100-connection limit
    Then requested is four and deployed, ready, and eligible remain two
    When I observe deployment once
    Then deployed is four but ready and eligible remain two
    When I observe capacity again
    Then ready is four but eligible remains two
    When I verify the fresh complete pool
    Then verification passes without admitting new traffic
    When I increase new-instance traffic share to 50 percent
    Then eligible is four and client records evidence actual new-instance admissions
    And successful transitions exclude successful old-only journeys

  Scenario: A request or a deployed instance is not permission to increase admission
    When I attempt increased admission before complete fresh capacity verification
    Then the action is blocked without synthetic transition journeys

  Scenario: One healthy response cannot authorize an incomplete required pool
    Given one additional instance remains unready
    When I observe deployment and readiness and verify capacity
    Then deployed is four, ready is three, and eligible remains two
    And verification fails with per-instance evidence

  Scenario: Missing capacity telemetry is unknown rather than zero or success
    Given the capacity observation is unavailable
    When I observe capacity and attempt verification
    Then the affected counts are unknown with confirmed lower bounds
    And the verdict is unverified rather than passed or a fabricated platform failure

  Scenario: Provisioning failure remains distinct from missing observations
    Given the fixture reports a provisioning failure
    When I observe capacity
    Then the failure is explicit and effective capacity has not increased

  Scenario Outline: Measured training budgets gate increased admission
    Given four fresh ready instances
    And <condition>
    When I verify capacity and attempt increased admission
    Then <outcome>
    Examples:
      | condition                                          | outcome                                      |
      | 80 pooled connections exceed a limit of 60          | admission is blocked by dependency pressure   |
      | demand is 161 requests/second at a 50 percent split | admission is blocked by the 80 percent ceiling |
      | demand is 160 at a 75 percent new-instance share    | the overloaded new pool blocks admission     |
      | demand is 160 at a 50 percent new-instance share    | both pools meet their measured 80 percent ceiling |

  Scenario: Stale evidence requires re-observation and verification
    Given a successfully verified complete pool
    When I advance the logical clock by 31 seconds
    Then increased admission is blocked by measured readiness age
    When I observe and verify capacity again
    Then a new admission attempt can use the fresh observation
    And prior observation timestamps and verdicts are unchanged

  Scenario Outline: Complete journeys determine the result after admission
    Given additional fresh ready capacity and valid load and connection budgets
    When I increase traffic with the <fixture> fixture
    Then <classification>
    And each affected journey records instance, latency, connection, state, and effect evidence
    Examples:
      | fixture           | classification                                                  |
      | healthy           | affected journeys complete within 800 milliseconds               |
      | slow-journey      | over-budget affected journeys are interrupted                    |
      | broken-connection | a broken required connection is an interruption                  |
      | journey-unknown   | missing affected client outcomes are unknown, not successes      |

  Scenario: Recovery cannot erase previously interrupted or unknown journeys
    Given an admitted run with interrupted or unknown affected journeys
    When I recover the synthetic fixture and observe and verify it again
    And I conduct a new healthy admission sample
    Then the earlier observations, client records, and cumulative outcomes remain intact
    And an earlier interruption prevents a cumulative uninterrupted verdict

  Scenario: Adding a deployment slot alone does not add compute
    When I add a synthetic slot
    Then the slot count changes but all instance counts and compute capacity are unchanged
    And no transition success is claimed

  Scenario: Invalid controls fail safely
    When I submit malformed, out-of-range, fractional, or unknown inputs
    Then a visible invalid-input result preserves capacity and prior evidence
    And no client journeys or external side effects are invented

  Scenario: Reset restores the declared baseline
    When I reset by keyboard after a run or an invalid input
    Then the form's reset method is still callable
    And the initial controls, two eligible instances, and empty in-memory run are restored

  Scenario: The exercise is offline and keyboard-conductible
    Given restrictive local script/style-only content security policy
    When I open the standalone entry point in isolated signed Edge
    Then labeled controls work with keyboard input and visible focus
    And results and errors are announced with text rather than color alone
    And external connections, inline execution, forms, and embedded content are prohibited
    And native B-S011, parent D-S011 and D-S021, five-nines, and Node 24 proof remain incomplete
