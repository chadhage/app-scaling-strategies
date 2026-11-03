Feature: S035 login callback during cutover
  # A-S035 / D-S035 / SC-S035; one frozen Kano S unit.
  # Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given one synthetic learner starts login on v1 at 0 ms
    And routing cuts over to v2 at 40 ms
    And the original login budget is never restarted
    And no real identity provider, token, credential, network call or timer is used

  Scenario: Shared correlation and compatible callback complete the original login
    Given shared correlation, a matching synthetic state marker and a compatible callback
    And callback delay is 100 ms and the original budget is 500 ms
    When I start login, cut over, then deliver the callback
    Then v2 completes the original login at 160 ms with the original return path
    And the synthetic journey is SUCCESS with zero redirect hops or forced restart

  Scenario: Lost v1-local correlation is an interruption
    Given correlation is available only on v1
    When the callback reaches v2 after cutover
    Then the synthetic journey is FAILURE with STATE_LOST
    And a forced restart is identified as required but is not executed
    And no success-shaped replacement login is fabricated

  Scenario: A bounded redirect loop cannot count as authentication
    Given a redirect-loop callback path
    When the callback reaches v2 after cutover
    Then exactly three synthetic redirect hops are traced
    And the loop stops with FAILURE and no completed login

  Scenario: A mismatched synthetic correlation marker is rejected
    Given the returned synthetic state marker does not match
    When the callback reaches v2 after cutover
    Then the synthetic journey is FAILURE with STATE_MISMATCH
    And validation is not weakened to make migration look successful

  Scenario: End-to-end latency uses the original budget
    Given callback delay is 100 ms
    Then a budget of 160 ms succeeds
    But a budget of 159 ms fails even though login completes

  Scenario: Missing callback observations remain unknown
    Given callback observations are missing
    When I finish the synthetic exercise
    Then the synthetic journey is UNKNOWN
    And elapsed time, callback destination and completion are not invented
    And predicting UNKNOWN can pass the verifier without proving continuity

  Scenario: Prediction is independent of synthetic user impact
    Given correlation is available only on v1
    When I predict SUCCESS and finish the exercise
    Then the verifier is FAIL and the journey is FAILURE
    When a later run predicts FAILURE for the same condition
    Then the verifier is PASS and both failures remain in history

  Scenario: Invalid controls and out-of-order actions cannot change the run
    Given strict typed bounded inputs and a validated immutable state
    Then callback before cutover, repeated cutover and overlapping login are rejected
    And malformed, forged, sparse or oversized states are rejected
    And a seventh run is rejected without evicting any of the six retained runs

  Scenario: Keyboard operation, error recovery and reset are usable
    Given the standalone lesson is open with its exact training banner
    When I use Tab, native select keys and Enter
    Then I can start login, cut over, finish and inspect retained traces
    And invalid input focuses a visible alert without losing history
    And explicit reset restores defaults, clears only this lesson and focuses the first control

  Scenario: The browser enforces the local-only CSP
    Given only local external scripts and styles are permitted
    Then inline code and handlers, inline styles, connections, images, frames and workers are blocked
    And form submission and base changes are blocked
    And the lesson makes no management or authentication request
