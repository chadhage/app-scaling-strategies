Feature: A slow fictional client keeps its original journey budget
  S143 validates latency and connection recovery under explicitly supported
  network conditions. D-S143 includes retries/reconnects in the original
  journey budget and distinguishes labeled emulation from native observations.
  This portable A-S143 exercise uses fixed fictional teaching DATA ONLY.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And one original fictional journey starts at 1000 ms
    And its budget is 3000 ms and its immutable deadline is 4000 ms
    And the supported condition is labeled "slow-reader + reconnect / fictional DATA"
    And no network, clock, traffic, client, load-generator or user-data operation occurs

  Scenario: Conduct, inspect and explicitly measure the original journey
    When I start "within-budget"
    Then the phase is "started"
    And impact is unknown before any supplied interruption is recorded
    When I record the supplied slow-client interruption
    And I record the supplied backoff and reconnect to fixture-v2
    And I inspect the supplied final attempt
    Then original start, deadline and budget have not changed
    And waits, both attempts, backoff, reconnect and interruption are retained
    And no PASS is certified before explicit measurement
    When I measure the original journey
    Then the result is PASS at 2900 ms with 100 ms remaining
    And the impact is "recovered-after-interruption"
    And the native result is "unverified"

  Scenario Outline: Equality passes, overflow fails and unknown stays unknown
    When I conduct and measure "<preset>"
    Then the original journey verdict is "<verdict>"
    And the original completion elapsed is <elapsed>
    And an HTTP 200, fixture-v2 or short final attempt cannot override that verdict
    Examples:
      | preset                | verdict | elapsed |
      | within-budget         | PASS    | 2900    |
      | exact-deadline        | PASS    | 3000    |
      | one-ms-over           | FAIL    | 3001    |
      | per-attempt-reset     | FAIL    | 3700    |
      | missing-final-time    | UNKNOWN | null    |
      | missing-completion    | UNKNOWN | null    |
      | late-unknown          | FAIL    | null    |
      | reconnect-failed      | FAIL    | null    |
      | incorrect-200         | FAIL    | 2900    |
      | unsupported-condition | FAIL    | 2900    |

  Scenario: An already known overrun survives an unknown final result
    Given "late-unknown" has a known cumulative wait of 3201 ms after reconnect
    When the final completion and final time are unobserved
    Then completion time and elapsed remain null
    And the original budget check and journey verdict are FAIL
    And remaining budget at the known observation is -201 ms

  Scenario: Recovery and reset do not erase earlier interruption
    Given I have measured a failing original journey
    When I reset and measure a later passing journey
    Then the earlier FAIL, interruption, deadline and cumulative timing remain in history
    And resetting an unfinished good-looking trace archives UNKNOWN, not PASS
    And resetting an unfinished already-over-budget trace archives FAIL

  Scenario: Typed, bounded, replay-consistent state guards
    Given commands accept only closed presets and exact action shapes
    When a command is mistyped, coerced, out of order or has extra fields
    Then a typed safe error retains bounded sanitized rejection history
    And no arbitrary supplied text is retained or rendered
    When an original start, deadline, version, timing, verdict or history is forged
    Then replay validation rejects the snapshot without trusting its result
    And twelve runs, seventy-two accepted actions and twelve retained rejections are the bounds

  Scenario: Real local browser operation remains accessible and fail-closed
    When I use native select, Tab and Space to conduct the exercise
    Then visible focus follows the allowed actions and semantic status/error regions report results
    When a test-only named reset control shadows form.reset
    Then prototype-based reset still works and retains history
    When the local model fails to load
    Then conducting controls are disabled and no result is certified
    When an unapproved inline script or empty local form is submitted
    Then the actual browser enforces CSP without navigation or a live network probe

  Scenario: Normal verification never rewrites persistent lesson evidence
    Given RED, raw failures and historical captures are outside test autodiscovery
    When verification runs with CAPTURE_BROWSER_EVIDENCE unset, 0, true or 01
    Then lesson source and persistent evidence bytes are unchanged
    When I deliberately use exactly CAPTURE_BROWSER_EVIDENCE=1
    Then a new exclusive uniquely named raw browser capture is created
    And raw byte and canonical Git claims are separately retained
