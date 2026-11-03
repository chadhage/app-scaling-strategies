Feature: S046 synthetic SSE cursor resumption
  # A-S046 / D-S046 / SC-S046, one frozen S unit.
  Background:
    Given six fixed synthetic events with opaque IDs in a declared order
    And the old stream has visibly rendered the first three events
    And the original silence and recovery budget starts at the last old event
    And no real EventSource, network, identity or Azure operation is performed

  Scenario: Resume after the last rendered event
    Given Last-Event-ID is the saved third event
    When the operator starts, cuts over, and resumes the stream
    Then the visible log contains all six events exactly once in order
    And the synthetic open time does not restart the original budget
    And recovery exactly at the budget is a synthetic success

  Scenario: An open stream conceals missing events
    Given the saved cursor precedes the retained replay window
    When a new stream opens and returns only the fifth and sixth events
    Then the fourth event is reported missing
    And stream establishment is PASS while user transition is failure

  Scenario: Tail-only reconnection is not cursor resumption
    Given the operator omits Last-Event-ID and subscribes at the live tail
    When the stream opens successfully
    Then missing fourth and fifth events interrupt the synthetic journey

  Scenario: Replay is different from a duplicate visible effect
    Given an older cursor or duplicate wire event replays an already seen ID
    When the operator selects ID deduplication
    Then replayed IDs are counted without being rendered twice
    But rendering every wire event produces a duplicate-visible-event failure
    And replay processing time still consumes the original budget

  Scenario: Reordering or excessive silence interrupts
    When the returned fourth and fifth events are reversed
    Then ordering fails even if the connection opened and no IDs are missing
    When first delivery or final recovery exceeds the original budget
    Then the result is failure rather than a budget restarted at stream-open

  Scenario: Incomplete observation is unknown, not success
    Given the final event observation is withheld
    When the observed prefix is ordered and within budget
    Then completeness and final recovery are unknown
    But an observed gap, duplicate or budget breach still makes failure

  Scenario: Rejected connection is an explicit failure
    Given the new synthetic stream is rejected
    When the operator resumes
    Then stream establishment fails and no successful recovery is claimed

  Scenario: Guards and retained history bound the exercise
    Then malformed inputs, unknown enum values and invalid phase actions cannot advance
    And configuration cannot change during an attempt
    And each completed attempt is retained with success, failure or unknown counts
    And the ninth attempt is blocked instead of silently pruning history

  Scenario: Keyboard, prediction and explicit reset
    Then all controls work by keyboard with visible focus and announced errors
    And a correct failure prediction never relabels the interrupted user outcome
    And another attempt clears the current result but retains completed history
    And explicit reset restores exact defaults and clears history, trace and errors
    And the form reset method is not shadowed
    And CSP blocks inline code, external scripts, connections, forms and frames
