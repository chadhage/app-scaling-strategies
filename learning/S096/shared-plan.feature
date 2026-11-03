Feature: S096 bounded synthetic overlap headroom
  The frozen A-S096 satisfier belongs to LP-COMPARE and D-S096.
  It rehearses README S096 and the portable A-card contract only.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given a fixed synthetic worker supplies 100 compute units per observation tick
    And the baseline production plan has one worker
    And four production journeys retain state and have one business effect each
    And production dependency demand is 40 units plus 20 per warming slot
    And production and warm-up latency budgets are declared before each run
    And no candidate traffic is admitted and no user transition is attempted
    And at most six independent runs can be retained in this page session

  Scenario: Slots consume shared compute rather than adding it
    Given one production worker, two warming slots and shared-plan placement
    And production demand is 70 and each warming slot demands 40 compute units
    When I warm and measure the competing slots
    Then total compute is 100 and added compute from slots is zero
    And shared-plan headroom is -50 units
    And production latencies are 180, 184, 188 and 192 ms
    And all four HTTP 200 production journeys interrupt a 120 ms budget
    And the warm-up verifier fails without claiming a migrated user

  Scenario: Explicitly provisioned workers provide sufficient shared overlap headroom
    Given the same load and shared placement with two production workers
    When I warm and measure the competing slots
    Then total compute is 200 and the extra worker contributes 100 added units
    And headroom is 50 units and all observed production and warm-up budgets pass
    And a successful warm-up rehearsal is not a successful user migration

  Scenario: A separately provisioned candidate plan isolates production compute
    Given the same load and one worker on each of two distinct plans
    When I warm and measure the competing slots
    Then production headroom is 30 and candidate-plan headroom is 20 units
    And total compute is 200, including 100 explicitly added candidate-plan units
    And the two warming slots still compete on the candidate plan
    And the result claims neither independent fault domains nor native Azure capacity

  Scenario: Separate compute does not isolate a shared dependency
    Given the separately provisioned plans and dependency capacity of 60 units
    When I warm two slots whose aggregate dependency demand is 80 units
    Then dependency headroom is -20 units
    And one production journey succeeds and three interrupt the 120 ms budget
    And candidate admission is blocked and the failed journeys remain recorded

  Scenario: A saturated separate candidate plan safely blocks admission
    Given one worker per plan and four slots each demanding 40 compute units
    And the shared dependency has enough capacity
    When I warm and measure the competing slots
    Then production journeys remain within budget
    But the candidate plan has insufficient headroom and admission is blocked
    And this is a safe abort before exposure, not a completed migration

  Scenario Outline: Missing observations cannot produce success
    Given sufficient separate-plan compute and dependency capacity
    And the trace omits <observation>
    When I warm and measure the competing slots
    Then the result is unknown and candidate admission is blocked
    And <unknown> remain explicit instead of being discarded
    And configured capacity cannot substitute for observed capacity

    Examples:
      | observation | unknown                   |
      | capacity    | capacity and readiness    |
      | journeys    | four production journeys |
      | warm-up     | both warming slots        |

  Scenario: Known interrupted journeys remain failures despite missing capacity
    Given the overloaded shared-plan trace with capacity observations omitted
    When I warm and measure the competing slots
    Then all four observed interrupted journeys remain failures
    And missing capacity evidence is also retained
    And the result is failure rather than unknown or success

  Scenario: Budgets are inclusive and synthetic thresholds are not platform limits
    Given production latencies of 80, 84, 88 and 92 ms
    And warming latencies of 100 and 103 ms
    When the declared budgets are 92 ms and 103 ms
    Then equality at each budget passes
    But a 91 ms production budget interrupts one journey

  Scenario: Invalid or duplicate actions preserve the last valid evidence
    Given a loadable lesson and a measured run
    When an action is repeated without resetting the current rehearsal
    Or inputs are missing, fractional, out of bounds, unknown or malformed
    Or a forged or modified state is supplied
    Then a visible error rejects the action without appending or erasing evidence
    And the model accepts only immutable states that it created

  Scenario: Keyboard reset preserves history and the bounded allowance
    Given a retained failed run followed by a successful and an unknown run
    When I reset the current rehearsal using the keyboard
    Then controls return to declared defaults and focus returns to the first control
    And current output and errors clear without native form.reset shadowing
    And earlier failed and unknown journeys remain in the history and totals
    And the seventh run is rejected without deleting any of the six retained runs

  Scenario: Actual isolated browser enforcement and read-only verification
    Given the published isolated helper, offline Playwright 1.56.1 and signed Edge 156
    When I conduct the real DOM, keyboard, invalid-input, reset and failure checks
    Then external scripts, inline scripts and network connections are blocked by CSP
    And application rendering uses text rather than executable HTML
    And the isolated session is closed in an awaited finally block
    And ordinary verification changes no owned source or evidence bytes
    And browser evidence is written only for exact CAPTURE_BROWSER_EVIDENCE=1
