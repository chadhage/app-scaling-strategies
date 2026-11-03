Feature: S069 fenced writer handoff, portable synthetic rehearsal
  # A-S069 / D-S069 / SC-S069 / frozen S / worker-A-S069
  # README S069: Fence the previous writer before accepting writes through the replacement.
  # D-S069: Only the authorized epoch writes; stale writers are rejected and acknowledged data is retained.
  Background:
    Given the visible label "Training rehearsal - synthetic data - not a live Azure result"
    And two fixed acknowledged effects belonging to old writer epoch 41
    And replacement writer epoch 42, six bounded write observations and at most six retained attempts
    And no database, lease service, cloud, network, credentials or real concurrent writers

  Scenario: Confirmed fencing precedes the replacement write
    Given a confirmed authority receipt and the complete acknowledged-data fixture
    When I begin, transfer the epoch, probe both writers, replay the stale grant and verify
    Then only the replacement writer at epoch 42 accepts a new effect
    And the old writer's delayed write and replayed epoch-41 grant are rejected
    And even the replacement identity cannot write with a stale epoch-41 token
    And replay cannot regress authority from epoch 42 to epoch 41
    And both originally acknowledged effects remain exactly once with unchanged payloads
    And the safety result is PASS, with three accepted and three deliberately rejected write observations

  Scenario: Skipping the fence exposes competing writers
    Given the unsafe bypassed-fence fixture
    When I conduct the same steps
    Then the replacement and old writer both accept effects
    And a stale grant can regain authority in this deliberately broken fixture
    And the safety result is FAIL, even if my learning prediction is correct

  Scenario: Missing authority evidence is not a successful handoff
    Given the unavailable-authority-receipt fixture
    When I conduct the same steps
    Then replacement admission is held and stale-writer outcomes remain unknown
    And missing observations are not evidence of rejection or zero effects
    And the safety result is UNKNOWN, not PASS

  Scenario: Acknowledged data loss independently fails the handoff
    Given any authority-receipt choice and the missing-acknowledged-effect fixture
    When I conduct the same steps
    Then the missing original effect is identified by its fixed operation ID
    And the safety result is FAIL, including when authority evidence is unavailable
    And no retry, prediction or new attempt rewrites this retained failed result

  Scenario: Inputs and lifecycle reject without mutation
    Given an idle rehearsal
    When configuration has extra, inherited, accessor, symbol or coercible properties
    Or an action is skipped, repeated, given extra arguments or used in the wrong phase
    Then a descriptive error is returned without changing any lesson state
    And only exact primitive enum inputs are accepted
    And all snapshots, fixed inputs and retained results are detached and immutable

  Scenario: Retain proof until an explicit reset
    Given a completed attempt and its independently checked learning prediction
    When I begin the next attempt
    Then the complete earlier configuration, writes, authority trace, assertions and prediction remain inspectable
    And the sixth result fills a hard cap rather than silently evicting earlier proof
    When I explicitly reset from any phase
    Then local history, inputs, errors, locks, results and predictions are cleared
    And keyboard focus returns to the begin control
    And no form control shadows the native form.reset method

  Scenario: Actual browser boundary
    Given native keyboard-operable controls and visible focus
    When I conduct PASS, FAIL and UNKNOWN paths, inject invalid inputs and reset
    Then actual DOM results, retained history and error associations match the model
    And enforced CSP blocks inline code and connection probes
    And ordinary verification does not rewrite historical proof
    And deliberate browser capture alone uses CAPTURE_BROWSER_EVIDENCE=1
    And the qualified isolated helper is closed in an awaited finally block
