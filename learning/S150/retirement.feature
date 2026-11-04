Feature: A-S150 post-retirement verification prevents unsafe deletion
  All versions, inventories, journeys, effects, checks and retirement states are
  fixed fictional teaching data. No resource, file or user data is deleted.
  The banner is "Training rehearsal - synthetic data - not a live Azure result".

  Scenario: Outstanding dependencies defeat reassuring routing and health
    Given desired routing is 100 percent v2 with healthy v2 and green requests
      And the original v1 journey has an earlier recorded interruption
      And required v1 sessions, jobs, artifacts, leases and retention remain
    When the operator conducts Verify retirement and inspects the required inventory
    Then retirement is REJECTED and deletion is prevented
      And each unresolved guard names its exact dependency and user impact
      And the safety-control verifier passes without claiming a migration or deletion
      And cleanup outcome and remaining-resource status are exportable synthetic data

  Scenario Outline: Any required dependency must hold retirement
    Given the fixed <fixture> snapshot
    When Verify retirement is conducted
    Then <guard> for <dependency> prevents retirement
      And no actual deletion is performed
    Examples:
      | fixture           | guard                 | dependency              |
      | routing-remains   | routing-exhaustion    | routing-v1              |
      | session-remains   | session-handoff       | session-v1              |
      | job-remains       | work-drain            | job-v1                  |
      | artifact-remains  | asset-contracts       | artifact-v1             |
      | lease-remains     | ownership-release     | lease-v1                |
      | retention-open    | rollback-retention    | retained-capacity-v1    |
      | drain-unproven    | declared-drain        | declared-drain-proof    |
      | contract-unproven | declared-contracts    | declared-contract-proof |
      | readiness-stale   | candidate-readiness   | candidate-v2            |
      | duplicate-effect  | effect-correctness    | effect-order-17         |

  Scenario: Unobserved dependencies hold and known blockers dominate uncertainty
    Given a required observation is missing
    When Verify retirement is conducted
    Then retirement is HELD_UNVERIFIED unless a known BLOCKED check makes it REJECTED
      And unknown observations remain explicitly visible in either case

  Scenario: Only the complete observed inventory permits a simulated retirement
    Given every required v1 dependency is observed resolved
      And declared drain, readiness, asset, contract, effect and retention proofs pass
    When Verify retirement is conducted
    Then only teaching data changes to SIMULATED_RETIRED
      And the original journey and all earlier attempts remain in the report
      And this is not native migration, deletion or source-parent acceptance

  Scenario: Conduct, inspect, select and check an exact answer
    Given a recorded verification with exact guard and dependency identifiers
    When the learner selects a matching unresolved guard and predicts its decision
    Then the answer verifier passes separately from the retirement and user-impact outcomes
    When the learner selects a passing guard, wrong dependency or wrong decision
    Then a failed answer remains inspectable and cannot change retirement evidence

  Scenario: Named fictional proof observations never erase an interruption
    Given an interrupted original journey in the outstanding snapshot
    When the operator records the named handoff proof and retention-end snapshots
      And conducts Verify retirement again
    Then the original journey ID, original latency budget and interruption are retained
      And the earlier rejected attempt remains a rejection

  Scenario: Malformed, stale, replayed and out-of-order commands reject atomically
    Given exact typed command and evidence schemas with finite bounds
    When an invalid token, string boolean, missing field or replay is supplied
    Then no state, history, evidence, counter or retirement outcome is changed
      And every required unobserved dependency still holds retirement

  Scenario: Browser keyboard, errors, retained history, reset and CSP
    Given the standalone file lesson with external local scripts and styles only
    When the learner uses Tab, Enter and Space and an invalid form submission
    Then the result is readable, errors are focused and invalid inputs are marked
    When a completed attempted run is archived
    Then its attempts, checks, evidence and interruption remain inspectable
    When the explicit reset button is used
    Then memory, totals, selectors, details and errors return to defaults
      And no control shadows the native form reset method
    Then CSP blocks inline code, connections, frames, objects, workers and form navigation

  Scenario: Verification is read-only and deliberate browser capture is append-only
    Given the published isolated browser helper at its exact approved SHA-256
    When normal focused tests run
    Then all owned source and historical proof bytes remain unchanged
    When and only when CAPTURE_BROWSER_EVIDENCE is exactly "1"
    Then one unique raw browser observation is deliberately preserved
      And openIsolatedLesson is closed in an awaited finally block
