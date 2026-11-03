Feature: Reconcile routing after a synthetic rollback command fails
  A-S099 / D-S099 / SC-S099 is one frozen Kano S teaching unit.
  Training rehearsal - synthetic data - not a live Azure result
  All rollback, fault, routing and reconciliation operations are data-only traces.

  Background:
    Given a retained healthy compatible known-good deployment in a fixed fixture
    And the synthetic requested rollback target is 100% known-good and 0% candidate
    And no cloud, shell, process, file or network operation implements a lesson action

  Scenario: A failed command does not prove the requested routing took effect
    When I record a synthetic rollback failure
    Then the command result is failure and effective routing is unknown
    And recovery is unknown and not complete
    When I choose a blind repeated reversal
    Then the choice is rejected without issuing a second rollback
    And the failure and rejection remain in history

  Scenario: Inspect unchanged routing and reconcile against that observation
    Given the failed-before-apply trace leaves 75% known-good and 25% candidate
    When I inspect effective routing
    Then I observe 75% known-good and 25% candidate, not the requested target
    When I reconcile known-good routing using that fresh observation
    Then the previous observation becomes stale and recovery remains incomplete
    When I inspect the new synthetic snapshot and verify recovery
    Then observed routing is 100% known-good and 0% candidate
    And synthetic recovery succeeds while the original rollback still counts as failure

  Scenario: A failed acknowledgement can accompany an already applied target
    Given the failed-after-apply trace has an unacknowledged 100% known-good target
    When I inspect effective routing and verify recovery
    Then synthetic recovery succeeds without a second rollback or reconciliation
    And retained known-good service and the original command failure stay visible

  Scenario: Reconciliation itself fails
    Given the reconciliation-fails trace has 50% known-good and 50% candidate
    When I inspect, reconcile, inspect again and verify recovery
    Then the reconciliation command also counts as failure
    And known routing remains 50% known-good and 50% candidate
    And recovery fails rather than being declared complete
    And a second ungrounded reconciliation cannot be issued

  Scenario: Effective routing remains unknown
    Given the routing-unobserved trace supplies no usable routing snapshot
    When I inspect and choose known-good reconciliation
    Then the reconciliation is blocked without inventing effective routing
    When I verify recovery
    Then recovery is unknown, not success, and not complete

  Scenario: Invalid or stale state cannot claim recovery
    When I submit an invalid trace, action, malformed state or duplicate terminal action
    Then no result or command is appended
    When I check recovery without a current inspection
    Then the check is rejected as unknown without completing the run

  Scenario: Bounded retained session history and keyboard reset
    Given at most four rehearsals with at most eight choices each
    When I reset the current rehearsal using a keyboard
    Then labelled controls return to defaults and focus returns to the trace selector
    And all previous failures, unknowns, observations and the allowance remain
    And success plus failure plus unknown equals all started synthetic rehearsals
    And errors are announced and focused

  Scenario: The real browser enforces the portable lesson CSP
    Given the exact banner is visible and the lesson uses local external assets only
    When an inline script, inline handler or data-URL connection is attempted by a test
    Then browser CSP blocks the attempt
    And no lesson action invokes a live provider, routing command or external request
