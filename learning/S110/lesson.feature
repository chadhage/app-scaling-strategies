Feature: A-S110 fictional edge propagation and old-origin retention
  The original S110 requires retaining old origins until sufficiently converged.
  D-S110 requires observed propagation AND drain gates, not desired configuration.
  This resource-free A card supplies fixed fictional teaching DATA ONLY.
  It cannot complete B-S110, D-S110, or certify actual global convergence.

  Background:
    Given the standalone lesson says "Training rehearsal - synthetic data - not a live Azure result"
    And three named fictional POP/cohort samples and one old origin are the whole declared fixture
    And every epoch, route, origin, latency, response and drain observation is authored DATA ONLY
    And the fictional latency budget is 120 ms, with at most six runs and 24 retained events

  Scenario: Nominal configuration is not propagation evidence
    When the operator rehearses a change to nominal 100 percent candidate epoch 2
    Then propagation, drain and journey results remain unknown before sampling
    When the operator checks retirement using only that configuration
    Then the result is unverified and the old origin is retained
    And that premature decision remains in history when observations are sampled later

  Scenario: Required observed propagation and drain permit only fixture-scoped retirement
    Given the converged trace is selected
    When the operator rehearses the change, samples all three POPs and checks retirement
    Then all three observed effective destinations have epoch 2 and candidate origin
    And all three observed journeys succeed within their original 120 ms budget
    And observed old-origin work is zero
    And the synthetic retirement gate passes and the fictional old origin becomes retired
    But no assertion claims every real edge, POP, cohort or origin has converged

  Scenario: Stale effective routing rejects a nominally complete change
    Given the partial-propagation trace is selected
    When the operator rehearses the change, samples and checks retirement
    Then one observed POP still routes to the old origin at epoch 1
    And observed old-origin work remains one
    And the retirement result is negative and the old origin remains retained
    And successful served journeys are not misreported as a completed migration

  Scenario: Missing observations are not zero work or global convergence
    Given the missing-observations trace is selected
    When the operator rehearses the change, samples and checks retirement
    Then one required POP result and old-origin work are unknown
    And the measured counts are two successes and one unknown, not three successes
    And the retirement result is unverified and the old origin remains retained

  Scenario: Converged sampled routes do not imply old work has drained
    Given the draining trace is selected
    When the operator rehearses the change, samples and checks retirement
    Then the observed propagation gate is positive
    But the observed old-origin work is two
    And the drain gate is negative and the old origin remains retained

  Scenario Outline: Client failures survive the retirement decision
    Given the <trace> trace is selected
    When the operator rehearses the change, samples and checks retirement
    Then the observed propagation and drain gates are positive
    But the recorded journey result is negative with one interruption
    And the old origin remains retained and the failed attempt stays in history
    Examples:
      | trace           |
      | latency-failure |
      | request-failure |

  Scenario: Strict commands and reconstructed state guard the bounded workflow
    Then strings, numbers, arrays, extra fields and forged state cannot act as commands or state
    And sampling before a change and repeated sampling fail without mutation
    And a new run cannot erase an unfinished run
    And a repeated premature retirement check fails without mutation
    And six completed runs prevent a seventh without discarding history

  Scenario: Real browser operation, errors, reset and security remain observable
    When the actual browser is driven with Tab, arrow keys and Enter
    Then the operator can conduct an observed positive and a stale-route negative rehearsal
    And a tampered unsupported selection produces a focused visible error without state mutation
    And reset clears all in-memory run state and history and restores selection focus
    And there is no control named reset that shadows the form reset method
    And restrictive CSP actually rejects an injected inline script and external connection
    And the normal verification run leaves lesson and retained proof bytes unchanged
    And browser proof is written only for exact deliberate CAPTURE_BROWSER_EVIDENCE=1
