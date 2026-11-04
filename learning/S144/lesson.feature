Feature: S144 combined tier pressure without live operations
  All load, tier, resource, queue, client, latency, throughput, and journey
  observations are fixed fictional teaching DATA ONLY.
  The envelope is one fictional 10000 ms concurrent window, 12 shared database
  connections, queue depth <= 4, worker wait <= 400 ms, original journey
  completion <= 1500 ms, and at least 3 successful affected journeys per window.
  Frontend demand is mediated by the API; it is not counted again as a
  database connection contributor. Nested tier times are not added together.

  Background:
    Given original A-S144 is a P1 S satisfier in SC-S144 with the SOURCE gate
    And the banner is "Training rehearsal - synthetic data - not a live Azure result"
    And there are no network, cloud, database, identity, or load-generator operations
    And five successful isolated measurements cannot certify a coupled workload

  Scenario: Exact equality passes only the observed combined window
    When the operator conducts, inspects, and measures the boundary fixture
    Then unique API, cache-refill, and worker contributions sum to 12
    And queue depth is 4 and worker wait is 400 ms
    And all 3 complete correct journeys finish at their original 1500 ms budget
    And measured successful throughput is 3 per window, or 0.3 per second
    And only this observed fictional coupled window passes
    And no native result or five-nines claim is produced

  Scenario: Successful isolated tiers obscure a shared bottleneck
    When the operator measures the overload fixture
    Then simultaneous shared demand is 7 + 5 + 4 = 16 against 12
    And downstream queue depth 8 and worker wait 600 ms fail
    And 2 interrupted journeys and 1 unknown completion remain in the denominator
    And observed wait records identify the shared database-connections bottleneck
    And the physical root cause of that contention remains unobserved
    And HTTP 200, readiness, request throughput, and averages cannot override failures

  Scenario Outline: Equality is inclusive and one unit beyond fails
    Given a complete boundary fixture
    When the observed <metric> increases by exactly one
    Then that <budget> fails
    Examples:
      | metric              | budget              |
      | shared connections  | capacity            |
      | queue depth         | downstream queue    |
      | worker wait         | downstream latency  |
      | client completion   | original journey    |

  Scenario: Known interruption does not establish an unobserved bottleneck
    When the operator measures the observation-gap fixture
    Then a completed journey at 1501 ms is a known interruption
    And missing shared contributors and export completion remain unknown
    And an unrelated successful probe establishes neither cause nor completion

  Scenario: Missing measurements are not zero failures or success
    When the operator measures the unknown fixture
    Then all 3 attempted journeys have unknown completion
    And shared capacity and successful throughput remain unknown
    And absent effects and versions are never invented

  Scenario: A fresh mitigation window cannot rewrite prior outcomes
    Given an inspected and measured failed or unknown first window
    When the operator conducts the single fixed mitigation follow-up
    And inspects and measures its complete combined records
    Then the fresh 11-connection window passes
    And original interruptions and unknown journeys remain in retained history
    And only explicit reset clears rehearsal history

  Scenario: Typed and replayed commands cannot bypass inspection
    Then malformed profiles, numeric strings, NaN, infinity, extra fields,
      forged state, wrong run IDs, stale revisions, premature measurements,
      repeated measurement, and a second mitigation are rejected without mutation
    And reset increments the revision rather than re-enabling stale commands

  Scenario: The actual standalone browser is usable and constrained
    Then keyboard conduct, inspect, measure, identify, and reset work
    And invalid selections have visible focused errors with recovery
    And failure and unknown records are rendered without success-shaped fallbacks
    And script and style CSP restrictions are actually enforced
    And ordinary verification does not write evidence
    And only CAPTURE_BROWSER_EVIDENCE exactly equal to 1 creates unique raw evidence
    And the published isolated helper is used with awaited finally cleanup
