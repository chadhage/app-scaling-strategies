Feature: S114 unplanned regional failure, strictly synthetic
  Every origin, dependency, region, fault, probe, recovery and journey below
  is fixed fictional teaching DATA ONLY. Nothing fails an actual resource,
  network or process. No sampled proxy or fixture label certifies an actual
  Azure-region outage or full regional continuity.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And fictional Teaching North and Teaching South, with two origin labels each
    And fictional profile-store and order-log dependencies
    And a declared workload of 80 capacity units and required data revision 7
    And an agreed integer interruption budget from 10 through 120 synthetic seconds

  Scenario: Isolation labels are not observed regional guarantees
    When the operator isolates Teaching North origins, dependencies, or both as data
    Then detection, surviving capacity, data, transactions and client recovery are unknown
    And full regional continuity remains unknown even after a positive rehearsal

  Scenario: Bounded alternate recovery meets the fixture contract
    Given the alternate-ready fixture and a 60-second budget
    When the operator isolates, detects, checks alternate recovery, and samples journeys
    Then detection takes 12 seconds, switching 10 seconds, and client recovery 8 seconds
    And surviving capacity is 96 for 80 required units and data revision 7 is available
    And getProfile retains its fictional session and confirmOrder has exactly one effect
    And 30 interrupted seconds meet the declared budget
    And the result is positive only for this fixed fictional fixture

  Scenario Outline: Measured adverse evidence is not a success
    Given the <fixture> fixture and a 60-second budget
    When the operator completes the four ordered actions
    Then <check> is negative
    And the fixture conclusion is negative
    And full regional continuity is unknown
    Examples:
      | fixture             | check        |
      | capacity-shortfall  | capacity     |
      | data-unavailable    | data         |
      | budget-exceeded     | budget       |
      | duplicate-effect    | transactions |

  Scenario: Healthy sampled HTTP cannot prove dependency or region recovery
    Given the shallow-proxy-only fixture and a dependencies-only data fault
    When the operator completes the four ordered actions
    Then shallow HTTP samples are healthy
    But bounded detection, alternate capacity, state and end-to-end journeys are unknown
    And an unconfirmed order is unknown, not inferred lost or committed
    And no alternate is approved and no full-region claim is made

  Scenario: Typed guards and retained bounded history
    Given at most six rehearsals of four actions each
    Then only exact typed action shapes and authentic replayable state are accepted
    And malformed, forged, out-of-order and seventh-run requests do not mutate state
    And ordinary actions retain earlier positive, negative and unknown history
    And explicit reset restores defaults and clears history

  Scenario: Actual browser accessibility, error handling and CSP
    Then keyboard actions expose the synthetic trace and measured assertions
    And invalid inputs and forced out-of-order actions focus an error without losing history
    And reset does not shadow the native form reset method
    And missing model code produces a visible startup error, not a silent pass
    And restrictive CSP blocks inline script and local-file connection probes
    And normal verification leaves every lesson byte unchanged
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures browser proof
