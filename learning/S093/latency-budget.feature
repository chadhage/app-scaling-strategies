Feature: S093 rejects slow successful responses using a journey budget
  This is the A-S093 / D-S093 / SC-S093 frozen S learning unit.
  All statuses, durations, journeys, routing percentages and fault conditions
  are fixed synthetic teaching data, never actual requests or elapsed waits.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And three fixed attempted canary journeys each have synthetic HTTP status 200
    And the declared journey budget is either 1000 or 1500 milliseconds
    And the current synthetic canary is 25 percent
    And acceptance is independent of the operator's expand or hold choice

  Scenario: Slow HTTP 200 cannot pass acceptance or expand
    Given the "slow-200" durations are 420, 1700 and 2400 milliseconds
    And the budget is 1000 milliseconds
    When the operator requests expansion
    Then journey acceptance is failure and the decision verifier fails
    And expansion is blocked at 25 percent despite three HTTP 200 observations
    And attempted journeys are 3, successful journeys 1, interruptions 2, unknown 0

  Scenario: Correctly rejecting latency regression does not erase interruptions
    Given the same slow trace and budget
    When the operator holds the candidate
    Then the safe decision passes its verifier but journey acceptance remains failure
    And both interruptions remain in the attempted-journey denominator
    And no new expansion or real migration is claimed

  Scenario: A journey at the exact budget meets the inclusive boundary
    Given the "within-budget" durations are 420, 700 and 1000 milliseconds
    And the budget is 1000 milliseconds
    When the operator requests expansion
    Then synthetic acceptance is success and the next synthetic canary is 50 percent
    And all 3 attempted journeys meet their budget

  Scenario: Missing latency is unknown rather than HTTP-only success
    Given the "unmeasured-200" durations are 420, unknown and 700 milliseconds
    When the operator requests expansion
    Then acceptance and the verifier are unknown and expansion is blocked
    And attempted journeys are 3, successful journeys 2, interruptions 0, unknown 1

  Scenario: A later compliant run cannot relabel a previous slow run
    Given a completed slow run with two interruptions
    When the operator resets the current rehearsal and completes a compliant run
    Then both immutable history records retain their original budgets and outcomes
    And the aggregate denominator is 6 with 4 successes and 2 interruptions

  Scenario: Decisions require valid input and a ready untampered state
    When an unknown fixture, undeclared budget, extra field or invalid action is supplied
    Then the operation raises an explicit error without changing history or routing
    When a completed decision is repeated without reset or a saved result is altered
    Then the state guard rejects it without appending a false outcome

  Scenario: History has a fixed bound without silently dropping failures
    Given six retained decisions in this page session
    When the current rehearsal is reset and another decision is requested
    Then the history limit is reported and all six decisions are preserved
    And reset never grants a fresh history allowance

  Scenario: Keyboard, errors and reset are usable in the actual DOM
    When the operator uses labelled controls and keyboard activation
    Then results, trace rows, decision verdict and retained totals are observable
    And invalid input focuses the error without creating a result
    And reset restores the declared defaults, clears the current result and error
    And reset focuses the scenario control and does not shadow the form reset method

  Scenario: The standalone page enforces its content security policy
    Given only owned external script and style files
    When an inline script is inserted into the actual browser DOM
    Then the browser blocks execution and records a script policy violation
    And the lesson makes no HTTP requests, management calls or actual latency measurements

  Scenario: Verification is read only unless evidence capture is deliberate
    Given preserved non-auto-discovered RED snapshots and raw transcripts
    When the normal focused or browser checks run
    Then no owned source or evidence file changes
    And canonical Git text integrity is qualified separately from raw evidence bytes
    And browser evidence is written only with CAPTURE_BROWSER_EVIDENCE=1
