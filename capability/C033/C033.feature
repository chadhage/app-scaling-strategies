Feature: C033 boundary-held synthetic browser journey
  C033 is the original S/P0 unit in H006 with independently accepted C020 as its gate.
  Training rehearsal - synthetic data - not a live Azure result
  Only consent-gated read-only literal 127.0.0.1 browser tooling is in scope.

  Scenario Outline: The driver actually holds at a declared safe boundary
    Given an original attempt with an explicit synthetic profile, synthetic draft and original latency budget
    And the selected boundary is "<boundary>"
    When the browser starts the attempt and acknowledges all reads before that boundary
    Then the DOM shows a paused attempt with <requests> actual provider requests
    And no next action or provider request occurs while Resume has not been activated
    And the original attempt, draft and acknowledged profile remain unchanged
    When the user activates Resume using the keyboard
    Then the original driver continues through the remaining sequential v1 and v2 reads
    And both actual implementation responses preserve getProfile/1 business values
    And the local conclusion is not full H006, native transport, migration or live Azure qualification

    Examples:
      | boundary          | requests |
      | before-first-read | 0        |
      | between-reads     | 1        |

  Scenario: Monotonic time and the original budget keep running during a hold
    Given the actual browser clock is performance.now
    When the browser remains at the selected safe boundary
    Then observed elapsed time and paused duration increase with that actual monotonic clock
    And the original start and deadline do not change
    When the original budget expires before Resume
    Then the DOM reports the exceeded original budget while requests remain held
    And resumed reads cannot turn that miss into a new successful budget

  Scenario: Stop and Reset do not erase uncertainty or release a next request
    Given an attempt is actually held at a safe boundary
    When Stop or Reset is activated
    Then the old attempt is retained as unknown with an explicit interruption reason
    And no next read is released
    And a later attempt gets a different identity
    And earlier failed, unknown and late or out-of-order reply events remain visible

  Scenario: Failed and uncorrelated replies are not successful journeys
    When an actual synthetic fixture returns a non-success HTTP reply
    Then the attempt records the failed reply and does not advance to the next read
    When a read is interrupted, unavailable, malformed, duplicated or out of order
    Then the attempt records an explicit unknown outcome instead of declaring success

  Scenario: The closed listener is consent-gated and owned
    Given current C001 approval is read while holding Local\AppScalingStrategies_KanbanState_v1
    And all live ledger read handles close before releasing that mutex
    Then local.probe must be strictly allowed before a listener or browser is started
    And the actual server binds only literal 127.0.0.1 on an ephemeral port
    And foreign Host, origin, paths, queries, bodies, methods and redirects are denied
    And only closed owned assets and the two read-only C020 provider endpoints are served
    And there is no arbitrary target, proxy, authentication, real data, persistence or cloud action

  Scenario: Static files and cleanup are honest
    Given the page is opened without the actual owned HTTP listener
    Then journey controls are unavailable and there is no claimed HTTP or pause observation
    When bounded automated browser checks finish or fail
    Then the exact isolated browser and caller-owned server are awaited closed in finally
    And normal checks do not write evidence
    And deliberate CAPTURE_BROWSER_EVIDENCE=1 capture writes only a new unique owned directory
