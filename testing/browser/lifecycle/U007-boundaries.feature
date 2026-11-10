@U007 @zero_credit @owned_scratch
Feature: Snapshot mkdir options before any ownership decision
  Exclusive creation must not become recursive adoption through a changing getter.
  Existing U007 specifications and retained captures remain immutable.

  Scenario: Direct mkdir cannot adopt an existing neighbour through a changing recursive option
    Given the neighbour already exists and contains a sentinel
    And recursive reads false once and true on any later read
    When the owner attempts exclusive creation
    Then the caller option is read once and the captured false value reaches mkdir
    And the original EEXIST is retained with no creation provenance
    And cleanup never removes the neighbour

  Scenario: Observation uses the same captured option for its decision and the filesystem call
    Given a live invocation observes mkdir for its direct child
    And that child already exists and contains a sentinel
    And recursive changes after its first two reads
    When the invocation attempts mkdir
    Then the original getter is read once across observation and exclusive creation
    And the original EEXIST is retained with no creation provenance
    And the neighbour and its sentinel remain unchanged
