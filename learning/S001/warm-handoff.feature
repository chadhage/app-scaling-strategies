@A-S001 @D-S001 @S001 @LP-LEARN @synthetic
Feature: Warm v2 before a controlled handoff
  This portable exercise is synthetic, not B-S001 native proof or completion
  of D-S001. Desired routing alone is not evidence that a journey moved.

  Background:
    Given the execution mode is synthetic with no network or Azure resources
    And v1 serves an authenticated old journey with cart quantity 3
    And that old journey has 1 pending business effect and remains on v1
    And v2 starts WARMING with no ordinary admissions
    And the journey budget is 500 simulated milliseconds
    And the rollback retention window is 1000 simulated milliseconds after handoff

  Scenario: Rehearse, hand off new admissions, then safely retire
    Given the healthy fixture has compatible configuration and enough overlap capacity
    When I rehearse v2 warm-up
    Then readiness checks for identity, freshness, instances, dependencies, configuration, authentication, state, exactly-once effects, latency, and capacity pass
    And v2 becomes READY without claiming any migrated users
    When I hand off new admissions
    Then the observed new journey is on v2 with authentication intact and cart quantity 3
    And its business effect occurs exactly once with latency 180 milliseconds
    And the exercise verdict is PASS
    And the old journey is still running on v1 with its effect pending
    And v1 remains available for drain and rollback
    When I finish the old work and advance the rollback retention window
    And I request retirement
    Then the old journey completes once on v1 in 240 milliseconds
    And v1 is RETIRED only after drain and retention gates pass
    And cleanup reports only local synthetic state, not deleted Azure resources

  Scenario: Choosing an unready destination fails even though the guard protects users
    When I hand off before rehearsing warm-up
    Then the exercise verdict is FAIL
    And admission stays on v1
    And the user-impact result says safe abort before exposure, not successful migration
    And no new transition journey is fabricated
    When I try warm-up without resetting
    Then the failed exercise remains failed and instructs me to reset

  Scenario Outline: A known warm-up regression blocks exposure
    Given the selected condition is <condition>
    When I rehearse warm-up and request handoff
    Then the exercise verdict is FAIL
    And v2 is ABORTED before exposure
    And the old journey and v1 admission remain intact
    Examples:
      | condition          |
      | dependency-failure |
      | incompatible-state |
      | duplicate-effects  |
      | slow-warmup        |

  Scenario: Missing readiness evidence is unknown, never a successful gate
    Given the warm-up dependency observation is missing
    When I rehearse warm-up and request handoff
    Then readiness is UNKNOWN and v2 is not eligible
    And the missing dependency check is marked unknown
    And admission stays on v1 without a completed migration claim

  Scenario: Missing actual admission evidence is not repaired by desired routing
    Given all warm-up gates pass
    And the next journey's observed destination stamp will be missing
    When I hand off
    Then the verdict and user-impact result are UNKNOWN
    And the attempted new journey remains in the trace and attempted sample
    And future admissions return to v1 and v2 is QUARANTINED
    And retirement is forbidden because successful migration was not established

  Scenario: A failed exposed journey remains a failure after rollback
    Given warm-up passes but the handoff journey will take 501 milliseconds
    When I hand off
    Then the observed journey reaches v2 but the verdict is FAIL
    And user impact reports one interrupted attempted journey
    And future admissions return to v1 without erasing the interruption
    When I finish old work or advance retention
    Then the failed attempted journey remains failed
    And v1 cannot be retired on the strength of the failed transition

  Scenario: Drain and rollback are separate retirement gates
    Given a successful synthetic handoff
    When I request retirement while old work or rollback retention remains
    Then retirement is blocked and the exercise fails
    And the new journey's successful observation is not erased
    And cleanup explicitly says v1 is still retained

  Scenario: Evidence and budget boundaries are explicit
    Given readiness evidence for the current candidate at its current epoch
    When I evaluate known, missing, stale, and altered observations against the assertions
    Then latency 500 milliseconds passes and latency 501 fails
    And evidence age 1000 milliseconds passes and age 1001 is unknown
    And 2 available overlap units for 2 required units passes, but 1 fails
    And zero or duplicate effects fail while a missing effect observation is unknown
    And a missing or empty transition trace is unknown, not 100 percent success
    And wrong destination, lost authentication, or lost cart state fail
    And an unknown condition or action cannot silently use the healthy fixture
