Feature: S015 Horizontal scale-in
  A-S015 is one frozen satisfier in SC-S015, parent D-S015.
  Training rehearsal - synthetic data - not a live Azure result
  The declared two-instance fixture is not a native host guarantee.

  Background:
    Given retiring-A owns one admitted request and one admitted job at tick 0
    And retained-B is ready for this bounded synthetic workload
    And request duration is 2 ticks and job duration is 4 ticks
    And original work budget is 6 ticks and drain budget is 5 ticks
    And all observations and actions are synthetic

  Scenario: Finish admitted work before removing capacity
    When I start the drain fixture and close new admission to retiring-A
    And I probe fresh admission and observe retained-B
    And I advance four logical ticks
    And I retire retiring-A and probe fresh admission again
    Then actual synthetic capacity changes from 2 to 1
    And both originally admitted work items succeed within their original budgets
    And the job has exactly one business effect
    And no unintended new work is admitted to retiring-A
    And verification passes but native outcome remains unverified

  Scenario: Durable continuation is not request relocation or a new clock
    Given I choose the declared checkpoint-continuation fixture
    When I close admission and checkpoint the active job
    Then only the job moves to retained-B with its original deadline
    And the request remains on retiring-A until it completes at tick 2
    When I retire retiring-A at tick 2 and finish the continued job at tick 4
    And I probe fresh admission after retirement
    Then two admitted work items succeed and the job has one effect

  Scenario: Premature retirement is blocked without discarding work
    When I close admission and probe retained-B while work is active
    And I request safe retirement
    Then retirement is blocked and actual capacity remains 2
    And no admitted work is invented as completed or lost

  Scenario: Explicit unsafe fault records lost work
    When I confirm the synthetic terminate-now fault while work is active
    Then both admitted work items are interrupted
    And verification fails even if the remaining clock is advanced
    And the original failed event remains in history after reset

  Scenario: Missing checkpoint does not authorize continuation
    Given the checkpoint proof is missing
    When I close admission and attempt the checkpoint
    Then its proof is unknown and the job does not move
    And safe retirement remains blocked while that job is active

  Scenario: Opaque host behavior remains unknown
    Given I choose the opaque unqualified-host fixture
    When I request closure or retirement
    Then no supported native behavior is fabricated
    And verification cannot pass from finished work alone

  Scenario: Failed closure, missing completion, or missing retirement evidence
    When I exercise stale routing, missing completion, or unobserved retirement
    Then stale routing is a failure and blocks safe retirement
    And a missing observation remains unknown rather than successful
    And a known original-budget failure takes precedence over separate unknown proof

  Scenario: Drain and work budgets are different assertions
    Given drain budget is 3 ticks but admitted work finishes within 6 ticks
    When I drain until tick 4 and request retirement
    Then safe retirement is refused with capacity retained
    And work continuity succeeds but the scale-in verifier fails its drain budget

  Scenario: Strict inputs, bounded state, retained evidence, and keyboard reset
    When an input is missing, fractional, non-finite, wrongly typed, extra, or unsupported
    Then it is visibly rejected without changing work or capacity
    And a prior pass is not presented as the current verification
    And forged states and unconfirmed unsafe faults are rejected
    And logical time, action history, probes, and in-memory archives stay bounded
    When I activate controls and reset with the keyboard
    Then defaults and working state are restored without shadowing form.reset
    And previous attempts remain in the bounded session archive

  Scenario: Offline restrictive browser policy
    When I open the standalone local lesson in isolated headless Edge
    Then the exact synthetic banner, labels, tables, errors, and results are visible
    And inline script and external connections are blocked by enforced CSP
    And no external request completes and the isolated session is closed in finally
