Feature: S013 concurrency/queue-driven scale-out
  As a learner conducting A-S013, one frozen S unit in SC-S013
  I select a supported workload metric and increase synthetic pressure
  So that I distinguish scaling intent, observed capacity, and completion deadlines.

  Background:
    Given the banner is exactly "Training rehearsal - synthetic data - not a live Azure result"
    And the source is canonical README S013 and D-S013 with no original prerequisite
    And this resource-free portable lesson makes no management calls
    And two ready workers each complete two FIFO work items per five-second window
    And the maximum is four workers with one further window of warm-up
    And queue-depth >= 8 or selected concurrency per ready worker >= 6 requests one worker
    And thresholds are teaching constants, not Azure metric or platform qualification
    And each batch retains its submission time and its original deadline

  Scenario Outline: A selected supported metric causes observable scale-out
    Given the selected metric is "<metric>"
    And a batch contains 12 items with a 20-second deadline and concurrency 12
    When I enqueue the batch
    And I advance one window
    Then requested workers is 3 and observed ready workers is 2
    And 4 items are completed at five seconds and 8 remain queued
    When I advance two more windows
    Then observed ready workers is 3
    And all 12 items finish by their original deadlines
    And at least one item was observed completing on an added worker
    And the exercise verifier is PASS
    Examples:
      | metric      |
      | queue-depth |
      | concurrency |

  Scenario: Only the selected metric controls the rule
    Given queue-depth is selected with a batch of 2 and concurrency 120
    When I enqueue and advance a window
    Then no scale-out is requested from unrelated concurrency pressure
    And finishing the batch alone is not proof of the required scaling transition

  Scenario Outline: Threshold equality and absence of pressure are explicit
    Given the selected metric is "<metric>" with batch "<batch>" and concurrency "<concurrency>"
    When I enqueue and advance a window
    Then the rule decision is "<decision>"
    Examples:
      | metric      | batch | concurrency | decision            |
      | queue-depth | 7     | 12          | BELOW_THRESHOLD     |
      | queue-depth | 8     | 0           | SCALE_OUT_REQUESTED |
      | concurrency | 2     | 11          | BELOW_THRESHOLD     |
      | concurrency | 2     | 12          | SCALE_OUT_REQUESTED |

  Scenario: Deadline equality succeeds but late completion does not
    Given a batch has a five-second deadline
    When an item completes at five seconds
    Then it is ON_TIME
    When another item completes at ten seconds
    Then it is LATE and the user-impact verdict is DEADLINE_MISSED
    And later recovery cannot erase the missed deadline

  Scenario: Work not yet completed can already have missed its deadline
    Given 40 items have a five-second deadline
    When I enqueue and advance two windows
    Then unfinished items past their deadline are explicitly overdue
    And a scale-out request or ready worker cannot make the verifier PASS

  Scenario: Provisioning failure does not become effective capacity
    Given a scale-out request is warming
    And the next observation is a provisioning failure
    When I advance a window
    Then the request and its FAILED transition remain in history
    And ready workers remains 2
    And successful work cannot overwrite the failed capacity observation

  Scenario Outline: Missing observations never become zero or success
    Given observation condition "<condition>"
    When I enqueue and advance a window
    Then "<observation>" remains UNKNOWN
    And the exercise cannot pass
    And the unknown observation remains recorded after healthy recovery
    Examples:
      | condition          | observation        |
      | metric-missing     | rule metric        |
      | capacity-missing   | effective capacity |
      | completion-missing | one work outcome   |

  Scenario: A worker error is different from a missed deadline
    Given a deterministic worker-failure condition
    When I enqueue and advance a window
    Then a failed work item is retained separately from late completions
    And the verifier is FAIL even after healthy work completes

  Scenario Outline: Unsupported and unqualified metrics execute nothing
    Given the selected metric is "<metric>"
    When I attempt enqueue and advance
    Then the support verdict is "<verdict>"
    And no synthetic time, work, rule, or capacity transition is fabricated
    Examples:
      | metric             | verdict     |
      | cpu-percent        | UNSUPPORTED |
      | native-unqualified | UNKNOWN     |

  Scenario: Invalid commands and bounded input fail closed
    When I submit missing, blank, fractional, non-finite, out-of-range, or unknown fields
    Or I submit an unknown action or condition
    Then an INVALID event is retained without changing work, time, or capacity
    And event, work-history, and archive limits refuse new work without deleting proof

  Scenario: Applying input does not rewrite existing work
    Given work and a warming request are already recorded
    When I apply a new batch size or deadline
    Then existing job deadlines and the request remain unchanged
    And state transitions are deterministic and do not mutate their prior inputs

  Scenario: Keyboard operation and reset retain failures
    Given I have recorded failed work and an input error
    When I use Tab, Enter, and Space to archive and reset
    Then native form.reset remains callable and restores the declared defaults
    And the failed work and error survive in a prior-run snapshot
    And no element named or identified "reset" shadows the form method

  Scenario: Unexpected application errors are visible and recoverable
    When an unexpected model error is deliberately injected by the browser test
    Then controls fail closed with ERROR rather than retaining a stale PASS
    And the current evidence and error remain available
    When I restore the model and archive/reset
    Then the failed run is retained and a new rehearsal can be conducted

  Scenario: Actual isolated browser evidence is honest and non-destructive
    Given offline Playwright 1.56.1, signed installed Edge 156, and the published isolated helper
    When I conduct DOM, keyboard, deadline, unknown, failure, error, and reset assertions
    Then restrictive CSP blocks inline code, external connections, and form submission
    And the isolated session is closed with an awaited close in finally
    And ordinary verification does not add, change, or delete committed proof
    And only CAPTURE_BROWSER_EVIDENCE=1 appends refreshed evidence
    And Node 22 tooling is not production Node 24 validation or native B-S013 proof
