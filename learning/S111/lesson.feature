Feature: S111 single application-worker loss during migration
  All topology, loss, recovery and measurements are fixed fictional teaching DATA ONLY.
  No process, node, zone, region, resource or network is changed.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And the declared workload is 60 requests per second with six journey samples within 120 ms
    And session, cart and receipt fixture state must match on both serving versions
    And worker-a and worker-b share node-1 and zone-1 in region-east
    And candidate worker-c is on node-2 in zone-2 in region-east
    And worker-d in region-west is an unmeasured, unrouted standby label

  Scenario: Surviving workers meet the fixture contract
    Given the redundant fixture and an application-worker scope claim
    When I explicitly observe baseline, record fictional worker-a loss and measure survivors
    Then observed surviving capacity is 80 requests per second against a demand of 60
    And all six journeys meet latency and fixture state requirements
    And the result is positive only for this authored application-worker-loss trace
    And no node, zone or region outage tolerance is verified

  Scenario Outline: Known interruptions cannot pass
    Given the <fixture> fixture and an application-worker scope claim
    When I observe baseline, record fictional worker-a loss and measure survivors
    Then the contract result is negative
    And the result includes <successes> successes and <interruptions> interruptions
    When I explicitly record fictional worker-a recovery
    Then recovered capacity is 120 and all six recovered journeys pass
    And the earlier negative measurement remains in history after reset

    Examples:
      | fixture            | successes | interruptions |
      | capacity-shortfall | 4         | 2             |
      | state-mismatch     | 5         | 1             |

  Scenario: Missing observations remain unknown
    Given the missing-observations fixture and an application-worker scope claim
    When I observe baseline, record fictional worker-a loss and measure survivors
    Then surviving capacity and candidate state are unknown
    And there are three successes, zero known interruptions and three unknown journeys
    And the contract result is unknown, never positive

  Scenario Outline: Broader failure claims are rejected
    Given the redundant fixture and a <scope> scope claim
    When I observe baseline, record fictional worker-a loss and measure survivors
    Then the measured workload contract is positive
    But the scope claim is negative because only one application worker is absent
    And same-node and same-zone worker-b still serves
    And all broader outage-tolerance claims remain unverified

    Examples:
      | scope  |
      | node   |
      | zone   |
      | region |

  Scenario: Inputs and state are guarded without losing evidence
    Given a reachable immutable rehearsal state
    When an input has wrong types, extra keys, an unknown fixture or scope
    Or an action is repeated, out of order or beyond six rehearsals
    Or computed results, counters or retained events are forged
    Then the action is rejected without mutation
    And resets preserve all earlier runs and measurements

  Scenario: Browser operation and evidence are honest
    Given the complete standalone local bundle
    When I use keyboard controls through positive, negative, unknown and recovery paths
    Then disabled controls reflect the state guards
    And validation errors receive focus without changing the last valid state
    And reset restores the controls but retains history
    And active CSP blocks inline script and connections without any external request
    And normal verification does not rewrite source or historical proof
    And only exact deliberate CAPTURE_BROWSER_EVIDENCE=1 writes fresh browser evidence
