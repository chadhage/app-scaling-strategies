Feature: S090 retirement is a guarded synthetic teaching transition
  Source: README S090, backlog D-S090, portable A-S090, packet SC-S090
  The banner is "Training rehearsal - synthetic data - not a live Azure result".
  Every deployment, client, work item and ownership record is synthetic.
  Retirement changes teaching-trace data, never resources, files or shell state.

  Scenario: Attempt cleanup before dependencies are resolved
    Given the all-dependencies fixture has old admissions, two pinned users, two work items, one state owner and two retention ticks
    When the operator attempts retirement
    Then the retirement attempt is FAILURE and the decision is REJECTED
    And all five blockers are reported and old capacity remains available in the trace
    And the safety verifier passes without claiming a completed migration

  Scenario Outline: Each dependency independently prevents retirement
    Given the <fixture> fixture
    When retirement is attempted
    Then <blocker> rejects retirement without changing the dependency
    Examples:
      | fixture        | blocker            |
      | traffic-only   | new-admissions     |
      | users-only     | pinned-users       |
      | work-only      | pending-work       |
      | ownership-only | state-ownership    |
      | retention-only | rollback-retention |

  Scenario: Unknown is not permission to retire
    Given the unobserved fixture has missing inventory observations
    When retirement is attempted
    Then the result is UNKNOWN and the decision is HELD_UNVERIFIED
    And there are zero successful retirement attempts
    When the operator applies the named synthetic inventory observation
    Then only the previously unknown observations become known

  Scenario: A known blocker dominates missing evidence
    Given the mixed-unknown fixture has missing observations and one known work item
    When retirement is attempted
    Then the result is FAILURE with both the known blocker and unknown fields visible

  Scenario: Explicit prerequisite resolution allows only a simulated retirement
    Given the all-dependencies fixture and an earlier rejected retirement attempt
    When new admissions stop, pinned users drain, work finishes and state ownership transfers
    Then retirement still fails while the rollback deadline is in the future
    When the operator advances exactly two synthetic ticks
    Then an attempted retirement is SUCCESS with the decision SIMULATED_RETIRED
    And earlier failures remain in the denominator and full trace
    And no native retirement, user migration or retention certification is claimed

  Scenario: Illegal commands are atomic and visible
    Given any idle, active or retired rehearsal
    When an unknown token, invalid type, out-of-order command or repeated resolved action is submitted
    Then a strict input or state error is reported
    And inventory, counters, history and trace remain unchanged

  Scenario: Predict the measured result rather than a desired result
    Given a recorded retirement attempt
    When the operator chooses SUCCESS, FAILURE or UNKNOWN
    Then the prediction is checked against that actual recorded attempt
    And a wrong prediction is visible without changing the attempt denominator

  Scenario: Retain bounded history
    Given at most four rehearsals with six retirement attempts and fourteen trace events each
    When a new rehearsal is started after an attempted retirement
    Then the previous complete trace and success/failure/unknown counts remain inspectable
    And exceeding a bound is rejected without eviction or silent truncation

  Scenario: Keyboard, error and reset behavior
    Given the browser-openable lesson
    Then all controls are labeled and work using Tab, Enter and Space
    And invalid inputs focus a visible alert and do not execute an action
    When explicit reset is chosen
    Then current data, history, counters, errors, predictions and open details clear
    And focus returns to the fixture control and native form reset remains callable
    And reload starts a fresh memory-only lesson

  Scenario: Enforced local content policy
    Given the published isolated helper and existing signed headless Edge
    Then ordinary exercise causes no HTTP requests or browser errors
    And inline scripts, inline handlers, inline styles, connections, frames and form navigation are blocked by CSP
    And browser evidence is written only with CAPTURE_BROWSER_EVIDENCE=1
    And normal verification does not modify lesson or evidence bytes
