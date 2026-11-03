Feature: A-S060 rollback after schema evolution
  A local synthetic rehearsal distinguishes compatible application reversal
  from explicit forward recovery when the old data contract is no longer valid.
  No result establishes a database migration, Azure operation or source-parent completion.

  Background:
    Given two committed synthetic USD orders worth 3500 minor units
    And an old v1 reader that requires totalCents and assumes USD
    And a 10 millisecond synthetic journey budget
    And at most 12 retained recovery decisions in this page

  Scenario: Compatible reversal preserves new committed data
    When the operator evolves with the compatible additive schema
    Then a third USD order worth 500 is committed with its old field retained
    When the operator rolls the application back to v1 with complete observations
    Then v1 reads all 3 orders worth USD 4000 within the budget
    And the expanded schema and optional new fields remain intact
    And the result is synthetic success, not a down migration

  Scenario: An irreversible old-contract break cannot fake a reversal
    When evolution removes totalCents and commits a new EUR order worth 700
    And the operator requests rollback to v1
    Then the unsafe reversal is a safe abort before exposure
    And active code remains v2 and all 3 committed records are unchanged
    And no attempted recovery journey is counted as successful
    When the operator explicitly chooses forward recovery to v2.1
    Then all 3 orders remain interpretable as USD 3500 and EUR 700
    And the history says forward recovery, never successful rollback

  Scenario Outline: Recovery cannot conceal a failed or unobserved journey
    Given an evolved <mode> schema
    When the operator chooses <path> with <observation> observations
    Then the attempted journey result is <outcome>
    And the original 3 committed records remain unchanged
    And the attempt stays in the measured denominator

    Examples:
      | mode         | path     | observation | outcome |
      | compatible   | rollback | missing-row | failure |
      | irreversible | forward  | missing-row | failure |
      | compatible   | rollback | unavailable | unknown |
      | irreversible | forward  | unavailable | unknown |

  Scenario: Reset cannot erase earlier failed and unknown outcomes
    Given a failed attempted recovery followed by reset and an unknown recovery
    When the operator resets the rehearsal
    Then the baseline v1 controls and two starting orders are restored
    And both historical outcomes and both attempted journeys remain
    And there is no success percentage for an empty sample

  Scenario: Input, state and capacity guards are enforced by the model
    Then recovery before evolution and repeated evolution are rejected
    And unsupported modes, paths, observations and extra action fields are rejected
    And forged states and mutation of immutable snapshots are rejected
    And a thirteenth history decision is rejected without changing prior evidence

  Scenario: The actual browser is usable and isolated
    Then the exact synthetic training banner is prominent
    And keyboard Enter and Space operate the core controls
    And invalid input and stale-state errors are visible without data changes
    And reset returns focus to the schema selector without erasing history
    And the enforced CSP blocks inline code, evaluation, connections and forms
    And ordinary verification does not rewrite published evidence
