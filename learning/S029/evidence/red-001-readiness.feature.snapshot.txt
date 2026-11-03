Feature: S029 flapping readiness, A-S029, D-S029, packet SC-S029
  Training rehearsal - synthetic data - not a live Azure result
  Preconditions: healthy GA and a compatible candidate are synthetic assumptions.
  Probes occur at integer ticks 1 through 6; inspection ends by tick 9.
  Admission requires 2 through 4 consecutive successful probes, each no older
  than the operator's 2 through 4 tick freshness bound. No real users are measured.

  Scenario: Intermittent green cannot advance a candidate
    Given the flapping sequence success, failure, success, failure, success, success
    And three required consecutive probes with maximum age two at tick six
    When I predict HOLD and check the window
    Then readiness is FAILURE with two success, one failure, zero unknown checks
    And the single-green comparison would ALLOW but the actual guard is HOLD
    And candidate admissions are zero and the answer verifier is PASS

  Scenario: A genuinely stable fresh window permits synthetic admission
    Given the recovered sequence failure, success, failure, success, success, success
    When I require three fresh consecutive probes at tick six and predict ALLOW
    Then readiness is SUCCESS and the answer verifier is PASS
    And only one final synthetic admission is permitted to candidate-v2
    And earlier failures remain visible in the trace
    But requiring four consecutive probes keeps the guard at HOLD

  Scenario: Missing, insufficient or stale evidence is not success
    Given a window containing an unknown probe or too few observed probes
    When I check the window
    Then readiness is UNKNOWN unless a fresh known failure already blocks it
    And missing checks stay in the denominator
    And inspecting old green samples beyond the freshness bound cannot admit

  Scenario: An incorrect operator answer cannot bypass admission
    Given a flapping or unknown window
    When I predict ALLOW
    Then the verifier is FAIL but candidate admissions remain zero
    And real user impact remains UNMEASURED

  Scenario: Invalid controls or state cannot alter earlier evidence
    Given a checked run in history
    When a malformed configuration, corrupted state or ninth run is submitted
    Then it is rejected and the eight-run bound never evicts evidence
    And configuration changes invalidate the current display but retain history

  Scenario: Keyboard, reset and offline safety
    Given the standalone lesson has labelled native controls and the exact banner
    When I choose options and submit using the keyboard
    Then results and retained traces are accessible
    And errors are focused alerts
    When I reset the lesson
    Then defaults, empty history and initial UNKNOWN are restored with control focus
    And CSP blocks inline code, connections, frames, objects, forms and base changes
    And ordinary verification leaves historical proof unchanged
