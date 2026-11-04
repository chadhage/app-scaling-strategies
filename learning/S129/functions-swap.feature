Feature: Supported-plan Functions swaps do not guarantee uninterrupted executions
  A-S129 / D-S129 / SC-S129 / one original frozen S unit
  Training rehearsal - synthetic data - not a live Azure result
  All hosting, slots, triggers, executions, checkpoints, acknowledgments, effects,
  recovery ticks and journeys below are fixed fictional teaching DATA ONLY.

  Background:
    Given no Function, resource, process, network, configuration or deployment is operated
    And two fictional old-slot executions are active before the routing switch
    And one declared transition client arrives at the candidate after the switch
    And a journey budget of 10 fictional ticks and a replay cost of 6 ticks are declared

  Scenario: Successful swap and probe do not establish execution continuity
    When the operator records the supported-slot swap and candidate HTTP 200 probe
    Then one original queue execution is terminated and its journey is interrupted
    And one original HTTP execution and journey remain unknown
    And one candidate journey completes within its original budget
    And the denominator remains all 3 started transition journeys
    And the probe is not counted as a migrated journey

  Scenario: Checkpointed deduplicated replay completes only the recoverable work
    Given the queue effect was committed before its acknowledgment was lost
    When the operator replays from checkpoint 2 of 3 with deduplication and 6 ticks
    Then checkpoint 3 and an acknowledgment are observed with exactly 1 known queue effect
    And recovery succeeds without erasing the original interruption
    And no automatic HTTP-trigger replay or unknown-outcome reconciliation is invented
    And educational verification passes but native and zero-downtime claims remain false

  Scenario: Blind replay duplicates an already committed effect
    When the operator chooses blind replay with a sufficient recovery budget
    Then 2 known queue effects and 1 duplicate are measured
    And verification fails even though swap, probe, replay and acknowledgment succeeded
    And the original interrupted and unknown journeys remain in the denominator

  Scenario: A bounded recovery window ends without completion evidence
    When the operator chooses a recovery budget below the fixed 6-tick cost
    Then no completed replay, advanced checkpoint or acknowledgment is invented
    And the bounded recovery result is unverified
    And the original interrupted and unknown journeys remain counted

  Scenario Outline: Unsupported hosting categories cannot run slot swaps
    Given the operator selects the fictional <host> category
    When a slot swap is requested
    Then the result is unsupported before any transition journey starts
    And an empty sample is not 100 percent success
    Examples:
      | host                           |
      | flex-no-slots                  |
      | functions-container-apps       |

  Scenario: Typed input and issued-state guards do not silently coerce or advance
    When a command contains malformed numbers, false or string consent, extra fields,
      an unknown action, an out-of-order action, or a forged state
    Then an explicit error occurs without changing observations or retained history

  Scenario: Reset preserves evidence and the lesson has a finite session bound
    Given a run has recorded interruptions, uncertainty and recovery
    When the operator resets the rehearsal
    Then the run and its events remain visible while controls return to defaults
    And at most 6 runs and 6 events per run can be retained without pruning

  Scenario: The actual local browser exposes keyboard, error and policy behavior
    Then labeled controls, visible focus, status and focused errors are keyboard usable
    And missing required local model data disables operation without inventing a result
    And CSP denies inline script, dynamic evaluation, data connections and Blob workers
    And normal verification does not rewrite any historical proof
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately appends new browser evidence
