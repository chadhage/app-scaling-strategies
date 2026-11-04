Feature: Nested verification runs report their own failures to the caller
  # Original D / P0 / H006; one test-tooling defect (L-0002), no production behavior change.
  Background:
    Given the retained initial stub whose assertion RED proves three deliveries are not an effect
    And a nested "node --test" is only evidence when its exit code is its own result
    And a nested run that inherits NODE_TEST_CONTEXT reports through the outer runner and exits 0 even when its test fails
    And a nested run that inherits NODE_V8_COVERAGE would write into the outer coverage directory

  Scenario: The child environment never carries the outer test-runner variables
    Given an environment holding NODE_TEST_CONTEXT, NODE_V8_COVERAGE, differently cased spellings and unrelated variables
    When the nested-run child environment is built
    Then NODE_TEST_CONTEXT and NODE_V8_COVERAGE are absent in every spelling
    And every unrelated variable keeps its exact name and value
    And the caller environment is not mutated

  Scenario: Without an explicit source the live process environment is sanitized, never changed
    Given the running process holds NODE_TEST_CONTEXT
    When the nested-run child environment is built without a source
    Then the child environment has no NODE_TEST_CONTEXT
    And the running process still holds its value

  Scenario: The retained initial stub still fails for the behavioral reason
    Given the caller environment carries NODE_TEST_CONTEXT
    When the retained initial stub test runs as a nested "node --test"
    Then the nested exit code is 1
    And the output shows ERR_ASSERTION and "'PASS' !== 'HOLD'"
    And the output shows no MODULE_NOT_FOUND
