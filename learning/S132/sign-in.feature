Feature: Finish the original fictional sign-in across a cutover
  All identity, session, callback, state, version, routing, restart and journey
  records are fixed fictional teaching DATA ONLY. No OAuth or identity operation
  takes place. A callback HTTP 200 or v2 label is never sufficient evidence.

  Background:
    Given source S132 "Finish authentication across the transition without requiring the user to restart"
    And D-S132 requires login without restarting, losing state or exceeding the agreed budget
    And A-S132 is one frozen S unit in packet SC-S132
    And one fixed fictional journey starts at 0 ms on v1
    And its cutover record is at 500 ms to v2
    And the agreed original journey budget is an integer 1000 through 5000 ms
    And the page shows "Training rehearsal - synthetic data - not a live Azure result"

  Scenario: A callback is only an intermediate record
    When the operator starts the compatible journey
    And cuts over and delivers its callback
    Then the original callback state and intended identity are shown
    But no continuous-sign-in result is measured yet
    When the operator finishes and verifies the signed-in page record
    Then the original journey finishes at 1800 ms within a 2000 ms budget
    And the issued fictional authenticated session binds the intended identity
    And the final page, original journey, versions and routing are correct
    And no forced restart is observed
    And the result is positive only for this one fixed fictional sample

  Scenario Outline: HTTP success cannot conceal a broken original journey
    Given the "<preset>" fixed trace has a callback HTTP 200
    When the operator completes all four ordered actions with a 2000 ms budget
    Then the measured original sign-in is negative
    And its "<reason>" is retained with the original time origin
    Examples:
      | preset                    | reason                 |
      | lost-state                | callback-state         |
      | state-mismatch            | callback-state         |
      | wrong-identity            | intended-identity      |
      | session-mismatch          | signed-in-session      |
      | forced-restart            | no-forced-restart      |
      | slow-200                  | original-journey-budget |
      | incompatible-state-version | state-version-contract |
      | wrong-route               | callback-route         |
      | wrong-page                | signed-in-page         |

  Scenario: Missing observations cannot certify continuity
    When the operator finishes callback-unobserved or timing-unobserved
    Then missing callback correlation or original completion time is unknown
    And signed-in true, HTTP 200 or a v2 label does not promote it to positive
    And a known negative still dominates other unknown observations

  Scenario: Budgets are agreed at start, not restarted at callback or cutover
    When a compatible original journey finishes at 1800 ms
    Then an agreed 1800 ms budget passes and 1799 ms fails
    And a 4200 ms slow completion fails a 2000 ms original budget
    And changing a displayed input after start cannot change the pinned budget

  Scenario: Typed input and replayed state fail closed without mutation
    When a command has coercible types, extra keys, accessors or an unknown preset
    Or the operator attempts cutover, callback or finish out of order
    Or a caller forges a phase, result, identity, trace, budget or retained history
    Then a visible safe-hold error is produced
    And no prior journey or accepted action is changed

  Scenario: Four measured journeys and sixteen actions remain retained
    When the operator conducts negative, unknown and positive journeys
    Then every prior result and its trace remain visible
    And after four runs the next start requires explicit reset
    And no old failure or unknown result is silently pruned

  Scenario: Actual standalone browser, keyboard, reset and failure observations
    Then native labels, tab order, visible focus, alerts and status are observed
    And keyboard actions complete the positive and negative exercises
    And malformed controls leave the current state intact
    And reset clears only this page's in-memory exercise using the native form prototype
    And a missing local model disables actions and displays no measured success
    And actual CSP denials block inline script, eval, styles, data connections,
      images, frames and form navigation without any remote request

  Scenario: Evidence and authority boundaries
    Then the loadable stub and genuine ERR_ASSERTION RED remain outside autodiscovery
    And IaC is N/A only after that behavioral RED
    And normal verification does not write lessons or historical proof
    And only exact CAPTURE_BROWSER_EVIDENCE=1 creates a new exclusive raw capture
    And raw bytes, canonical LF bytes and canonical Git blob identities are separate
    And the published isolated helper is pinned and its close is awaited in finally
    And native B-S132 and source D-S132 remain incomplete
    And only the parent may accept A-S132 once with no extra credits
