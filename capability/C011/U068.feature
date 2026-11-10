Feature: Bounded server-lifetime replay identity is independent of visible history
  This is a new, actual TDD attempt on a clearly labelled noncompliant baseline.
  The original pre-drafted core chronology is retained and remains uncertified.

  Scenario: An ended reservation disappears from history but its key still replays
    Given a conductor reserves and releases with a key
    And newer ended reservations evict its visible history row
    When the same conductor retries the original key and body
    Then it receives the exact original reservation identity in its ended state
    And no capacity, spend, replay slot or other lease changes

  Scenario: Expiry does not discard replay identity
    Given the injected clock reaches the original deadline and history evicts it
    Then a same-body retry replays the original expired reservation without allocation

  Scenario: Full replay ledger refuses only new unique keys
    Given one lease has filled its bounded replay ledger
    Then old keys still replay or conflict by body
    And a new key receives IDEMPOTENCY_LIMIT_REACHED with no effect
    And another lease's identical keys remain independent

  Scenario: A failed batch consumes no replay slot
    Given a batch releases an own reservation and then exceeds the key bound
    Then the entire batch is refused atomically
    And the original reservation remains held and the attempted keys stay unused

  Scenario: The caller sees only its own validated replay allowance
    Then used, maximum and remaining keys reconcile without exposing another lease
