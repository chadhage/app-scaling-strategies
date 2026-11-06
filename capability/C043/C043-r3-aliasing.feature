Feature: C043 third round (R3): no public return value shares a mutable object
  Written before the tests and the change. Same scope as C043.feature: SYNTHETIC, LOCAL, OFFLINE, Node built-ins only. A pure
  module that returns (or exports) a mutable object lets a consumer change what every later caller sees (L-0189: a returned
  flags object aliased across positions). The check is GENERIC, not a list of chosen examples: a walker visits every reachable
  object of every public return value, writes to it in strict mode, and the same function is asked again.

  Scenario: A write to every reachable object of every public return value changes no later answer
    Given the answers of the preset catalog, the preset parser (valid and invalid), the typed refusals, the runner (inspect, health, unsupported action, the replay of a run), the ledger snapshot and the exported modules and constants
    When a walker overwrites, deletes and adds every property of every object reachable from the answer, in strict mode
    Then the same function answers exactly what it answered before, because every answer is frozen or a fresh copy
    And the walker itself fails by name on a naive producer that returns its internal state
