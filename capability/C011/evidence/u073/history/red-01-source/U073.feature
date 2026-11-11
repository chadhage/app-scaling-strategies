Feature: Causal typed server refusal evidence for reset-prone C011 floods
  Scenario: The exact thirty-socket workload is accounted on the owned server
    Given the ordinary C011 service and same-run bare and naive controls
    And thirty tagged terminal requests with fifteen preceding public GETs
    When the server-owned cohort closes and its IPC observation barrier settles
    Then forty-five actual server response frames must match the request cohorts
    And thirty terminal writes must have the exact expected typed status and body
    And all closure, resource, neighbour, no-effect and typed-matrix checks remain

  Scenario: Client loss is not a fabricated server counter
    Given zero retained client response bytes and real typed server writes
    Then causal server evidence may qualify
    But missing, silent, wrong-cohort, wrong-status or wrong-body observations fail

  Scenario: History remains history
    Given original job146 is a genuine retained ERR_ASSERTION
    Then its wrong minimum client-read predicate is explicitly versioned
    And no changed assertion is called an unchanged old GREEN
