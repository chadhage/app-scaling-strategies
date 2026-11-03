Feature: Partial routing is not convergence
  # A-S087, D-S087, SC-S087; one frozen S unit. Synthetic clients only.
  Background:
    Given eight fixed synthetic clients and ready old-v1 and new-v2 destinations
    And a desired new-v2 cohort of 50 or 100 percent
    And an explicit delayed, partial, converged or missing observation fixture
    And old capacity is retained or a synthetic old-capacity-loss fault is selected

  Scenario: A command is not an observation
    When the operator requests the selected routing change
    Then desired routing is visible but effective routing and outcomes are unverified
    And configuration cannot change during the attempt

  Scenario: Partial application keeps remaining clients served
    Given desired new-v2 is 100 percent and only four clients actually use it
    When observed cohorts are inspected and old release is attempted
    Then all eight journeys pass while retained old-v1 serves four clients
    And convergence is FAILURE, old release is rejected and no completed migration is claimed

  Scenario: Losing required old capacity interrupts clients
    Given partial application and the synthetic old-capacity-loss fault
    When cohorts and the release gate are inspected
    Then four journeys fail with unavailable destinations
    And their failures remain in the attempt history

  Scenario: Delayed application is not success-shaped convergence
    Given delayed application with all eight clients still on old-v1
    Then desired 100 percent does not replace effective 0 percent
    And successful old journeys alone cannot establish migration

  Scenario Outline: Evidence controls old capacity, not the desired percentage
    Given converged application at <target> percent
    When observed cohorts and the release gate are inspected
    Then the synthetic routing result is SUCCESS
    And required old clients number <remaining>
    And the old-capacity decision is <decision>
    Examples:
      | target | remaining | decision         |
      | 50     | 4         | RETAIN_REQUIRED  |
      | 100    | 0         | RELEASE_ALLOWED  |

  Scenario: Missing cohort evidence cannot authorize release
    Given desired 50 percent with four unresolved routes and four observed old clients
    Then the result is UNKNOWN and effective percentage is unknown
    And old release is rejected without inventing destinations or successful journeys

  Scenario: Known failures dominate uncertainty without hiding it
    Given missing observations and the old-capacity-loss fault
    Then four known journey failures and four unknown journeys are both counted
    And the result is FAILURE rather than a success or an unknown-only result

  Scenario: Input and transition guards are atomic
    Then non-plain, inherited, accessor, extra-key and invalid enum inputs are rejected
    And out-of-order, repeated and argument-bearing actions cannot change state
    And returned snapshots cannot mutate internal evidence

  Scenario: Prediction is learning feedback, not user success
    When a completed failure is correctly predicted
    Then learning feedback is correct while the synthetic result remains FAILURE
    And an invalid or repeated prediction is rejected

  Scenario: Bounded retained evidence and reset
    Then six complete traces are retained without eviction and a seventh attempt is rejected
    And an active attempt remains in the attempted denominator
    And new attempt retains history while reset or reload clears all local data

  Scenario: Portable keyboard and error experience
    Then Tab, Enter and Space operate labeled controls with visible focus
    And invalid input focuses the field and state errors focus the alert
    And reset preserves native form.reset and restores defaults and focus

  Scenario: Browser boundary
    Then the exact synthetic banner is prominent
    And enforced CSP blocks inline execution and connections
    And ordinary verification does not rewrite provenance or screenshots
    And no native routing propagation, migration, retirement or Azure result is certified
