Feature: C043 third round (R3): two live instances, and the findings of the first review that had no test failing on the old bytes
  Written before the tests. Same scope as C043.feature: SYNTHETIC, LOCAL, OFFLINE, 127.0.0.1 with an ephemeral port, Node
  built-ins only. The pre-publication self-review of the second attempt listed gaps: nothing proved that two live servers or
  two live runners in one process are independent (everything per connection or per run is closed over one instance), and the
  evidence finding F2 and the documentation findings F6 and F7 of the first review had no test that fails on the first
  publication's bytes.

  Background:
    Given the preset service of C043 and its runner, each with its own step service and journals

  Scenario: Two live servers closed in FIFO and in LIFO order, one of them twice
    Given two servers are listening in one process and each has applied one preset
    When one of them is closed (the first started, then the other way round) and closed again
    Then the closed one accepts no connection, a repeated close resolves, and the neighbour keeps its ledger, its journals and its answers and still applies a new preset

  Scenario: A refused connection of one server never touches the connections of the other
    Given a keep-alive connection of B is open and A is about to refuse a request that has a valid mutation pipelined behind it
    When A refuses (marks and destroys its connection) while B serves a legitimate pipeline and A is closed
    Then nothing ran behind the refusal of A, B answered its pipeline in order, and the open connection of B is answered again after A closed

  Scenario: Two live runners
    Given two runners over their own step services and journals
    When one runner is halted twice
    Then it refuses with RUN_JOURNAL_UNAVAILABLE and the other completes its preset

  Scenario: The evidence recompute covers a manifest under a raw folder (finding F2)
    Given a capture manifest that lives under evidence/raw and pins a README
    When one byte of the README changes
    Then the recompute finds the manifest and names the input that differs from the recorded bytes

  Scenario: The README states what the duration budget and a coverage figure are (findings F6 and F7)
    Then the README says that the duration budget restarts on every drive and names the test that proves it
    And the README says that a coverage figure is a range, never a pin
