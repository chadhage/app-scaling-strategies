Feature: S062 connection-pool multiplication during scale-out
  # A-S062, D-S062, SC-S062; one frozen S unit, synthetic data only.
  # Training rehearsal - synthetic data - not a live Azure result
  # Baseline is one frontend and one API instance. Every modeled pool is saturated.
  # Demand = frontend instances * frontend pool + API instances * API pool.
  # Accepted = min(demand, limit); refused = max(0, demand - limit).
  # Latency ms = 80 + 2 * ceil(100 * demand / limit) + (refused > 0 ? 200 : 0).
  # These invented rules are not real database telemetry or native-platform proof.

  Scenario: Multiplication remains within the declared synthetic limit
    Given frontend and API pools of 10 and 20 connections per instance
    And target frontend and API instance counts of 2 and 3
    And a synthetic approved connection limit of 120 and journey budget of 300 ms
    When I observe the baseline and then scale and observe
    Then requested connections increase from 30 to 80
    And scaled accepted connections are 80 with 0 refused and 40 headroom
    And checkpoint latencies are 130 and 214 ms
    And both required synthetic journey observations succeed

  Scenario: Healthy individual pools exhaust the shared database budget
    Given the default pools, limit, and journey budget
    And target frontend and API instance counts of 4 and 5
    When I observe the baseline and then scale and observe
    Then scaled requested connections are 140 against the limit of 120
    And 120 are accepted and 20 are refused
    And connection exhaustion and a 514 ms journey are visibly failing
    And the successful baseline does not hide the scaled failure

  Scenario: Smaller per-instance pools recover without erasing a failed attempt
    Given a retained completed exhaustion attempt
    When I start another attempt with pools of 5 and 10 and target counts of 4 and 5
    And I observe the baseline and then scale and observe
    Then scaled demand is 70 and latency is 198 ms
    And the new attempt succeeds
    And the original failed configuration and results remain in history

  Scenario: Connection and latency budgets are independent inclusive gates
    Given pools of 10 and 20 and target counts of 2 and 2
    And a connection limit of 60
    When the journey budget is 280 ms and both checkpoints are observed
    Then demand equal to the limit succeeds with 0 headroom and 0 refused
    When the same attempt is repeated with a 279 ms budget
    Then the scaled journey fails on latency even with no refused connections

  Scenario: A planned ceiling is not an observed exhaustion result
    Given target counts of 4 and 5 with the default pools and limit
    And the scaled observation is deliberately withheld
    When I observe the baseline and then scale and observe
    Then the configured scaled ceiling of 140 still shows an over-limit forecast
    But scaled accepted connections, refusals, and latency are unknown
    And the aggregate result is unknown, not success or a claimed live failure

  Scenario: Pending data and known failures remain honest
    When only a successful baseline is observed
    Then the two-checkpoint result is unknown with one pending observation
    Given a known failing baseline and a withheld scaled observation
    When the attempt completes
    Then the result remains failure with one failed and one unknown observation

  Scenario: Strict inputs and replayed state reject unsafe or impossible commands
    Then only canonical bounded integer inputs and named observation presets are accepted
    And at least one tier must actually increase beyond its one-instance baseline
    And unexpected properties, malformed journals, duplicate and out-of-order actions are rejected
    And rejection does not mutate prior state or silently prune history
    And no more than six completed attempts can be retained before explicit reset

  Scenario: Browser operation is keyboard accessible and resource free
    Then native keyboard controls conduct the exercise and check a prediction separately
    And handled errors leave the measured trace and history unchanged
    And reset restores all defaults, focus, pending results, and empty history
    And no control shadows the native form reset method
    And the exact training banner is visible
    And actual browser CSP blocks inline code, network access, and form submission
    And verification does not write proof unless deliberate browser capture is enabled
