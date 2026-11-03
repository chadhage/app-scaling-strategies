Feature: A-S030 bounded initialization protects shared dependencies
  Training rehearsal - synthetic data - not a live Azure result
  Source S030: Limit initialization concurrency so candidate preparation does not overwhelm shared dependencies.
  Parent D-S030; packet SC-S030; frozen Kano S; one unit A-S030.

  Background:
    Given only deterministic synthetic observations, not Azure management operations
    And each candidate initializes for two synthetic ticks
    And four existing GA journeys per tick use four database and four cache units
    And each initializing candidate uses two database units and one cache unit
    And journey latency is 50 ms normally and 250 ms on overload against a 100 ms budget

  Scenario: Compare simultaneous with bounded warm-up
    Given six candidates, a concurrency bound of two, database capacity eight and cache capacity six
    And an initialization budget of eight ticks and complete observations
    When the operator predicts bounded SUCCESS and checks the comparison
    Then simultaneous preparation overloads database and cache and reports FAILURE in two ticks
    And bounded preparation reports SUCCESS in six ticks with 24 successful GA journeys
    And the answer verifier is PASS without claiming a native result

  Scenario: A bound is not automatically safe
    Given six candidates, concurrency three and the same dependency capacities
    When the operator checks the comparison
    Then overloaded dependencies, failed initialization and failed journeys remain visible

  Scenario: An excessively small bound misses the initialization budget
    Given six candidates, concurrency one and an eight-tick initialization budget
    When the operator checks the comparison
    Then dependency load stays within capacity but twelve ticks exceed the budget
    And the bounded outcome is FAILURE despite successful synthetic journeys

  Scenario: Equality is safe and the last batch is smaller
    Given five candidates, concurrency two, database capacity eight and cache capacity six
    When the operator checks the comparison
    Then bounded preparation uses three two-tick batches
    And the final batch initializes exactly one candidate without overload

  Scenario: Missing observations cannot certify success
    Given dependency and journey observations are missing
    When the operator predicts UNKNOWN and checks the comparison
    Then loads, observed duration and latency are unknown
    And initialization and journey denominators retain their unknown outcomes
    And both run outcomes are UNKNOWN while the answer verifier is PASS

  Scenario: Failed evidence survives a later successful comparison
    Given an incorrect answer or an overloaded bounded comparison has been recorded
    When the operator records a correct safe comparison
    Then earlier configurations, traces, failures and incorrect answers remain unchanged
    And each strategy displays its own journey denominator because durations differ

  Scenario: Invalid inputs and forged state do not create a run
    Given strict integer ranges, exact record schemas and a maximum of eight retained comparisons
    When invalid input, a forged prior result or a ninth comparison is submitted
    Then an explicit error appears without replacing the earlier evidence

  Scenario: Keyboard, reset and browser restrictions
    Given labelled native controls, a skip link, focus feedback and a strict local-only CSP
    When the operator uses Tab, arrow keys and Enter
    Then the same comparison is operable without a pointer
    When the operator explicitly resets
    Then defaults return, errors and in-memory history clear, and focus returns to candidate count
    And inline code, external connections and framing remain blocked by the real browser CSP
