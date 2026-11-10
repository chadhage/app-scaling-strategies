@U007 @zero_credit @owned_scratch
Feature: Reserve exclusive creation capacity before running caller option getters
  Taking one snapshot does not make an accessor free of synchronous side effects.
  The one-root bound and closed-owner boundary also hold during those effects.

  Scenario: A mkdir getter attempts a second creation on the same owner
    Given the owner has capacity for exactly one root
    When the first creation reads an option that reenters mkdir for a second root
    Then the first creation already holds the capacity reservation
    And the reentrant creation is refused before its filesystem call
    And exactly the first root is recorded and cleaned

  Scenario: A mkdir getter begins cleanup before creation has been issued
    Given exclusive creation has reserved its pending path
    When an option getter calls cleanup
    Then cleanup reports that pending path without claiming absence
    And the original creation is refused because cleanup has started
    And no filesystem mkdir is issued after that close boundary
