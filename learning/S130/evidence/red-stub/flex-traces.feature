Feature: Compare fictional single and multi-instance Flex update traces
  A-S130 / D-S130 / SC-S130 / one original frozen S unit
  Training rehearsal - synthetic data - not a live Azure result
  Every plan, instance, execution, restart, grace, state, effect, latency and outcome is DATA ONLY.

  Background:
    Given a standalone resource-free browser lesson with eight fixed fictional traces
    And three asynchronous tracking journeys with an original 900 ms polling budget
    And Flex has no deployment slots or authoritative site-update completion signal
    And rolling replacement uses a documented 60-minute scale-in grace reference
    And platform updates have a different documented 10-minute grace reference
    And neither a reference limit nor a log estimate proves execution completion

  Scenario: A trace must be explicitly loaded before inspection and measurement
    When I load multi-compatible with the exact software token v2
    Then the phase is loaded
    And no journey has yet been measured
    When I inspect executions and grace DATA
    And I measure the attempted journeys
    Then all three observed journeys are uninterrupted in this fixture only
    And fleet update completion remains unknown
    And no native or five-nines certification is available

  Scenario: Compare the same journeys on single and multiple instances
    Given I have measured the single-compatible trace
    Then one polling journey is interrupted during the recorded capacity gap
    And all three already-running executions are recorded completed
    When I measure the multi-compatible trace
    Then three journeys pass within their original state, effect and latency contract
    And both runs and the earlier interruption remain in history
    And increased instances do not establish that every user or execution completed

  Scenario Outline: Negative and unknown observations cannot be certified away
    When I load, inspect and measure <preset>
    Then the observed outcome is <outcome>
    And all three attempted journeys remain in the denominator
    And fleet update completion remains unknown
    Examples:
      | preset                 | outcome      |
      | multi-incompatible     | interrupted  |
      | multi-starved          | interrupted  |
      | multi-grace-expired    | interrupted  |
      | multi-grace-unknown    | unknown      |
      | multi-platform-restart | interrupted  |
      | multi-recreate         | interrupted  |

  Scenario: Strict input and state guards retain bounded history
    Given load, inspect and measure are exact typed commands
    Then strings, extra keys, accessors, forged state and out-of-order commands are rejected
    And errors do not mutate history
    And four complete runs retain all twelve actions without pruning
    And a thirteenth action is rejected until explicit reset

  Scenario: Keyboard, error, reset and fail-closed operation
    Then every control has a label and visible keyboard focus
    And invalid software tokens produce a visible alert without measuring a journey
    And reset uses the native form prototype and clears only this in-memory lesson
    And missing local model DATA cannot produce a successful result
    And actual browser CSP observations deny inline script, eval, style, connections,
      images, frames and form navigation without unsafe flags

  Scenario: Verification does not rewrite prior proof
    Then normal verification is read-only
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates a new unique browser capture
    And the published isolated helper is hash-pinned and closed in an awaited finally
    And raw RED and loadable stub bytes remain outside normal test autodiscovery
