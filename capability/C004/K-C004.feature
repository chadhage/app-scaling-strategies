Feature: K-C004 branch coverage for plan-fixtures.js and plan-provenance.js repays the C004 quality debt
  K-C004 / worker-K-C004 serves C004 [S]
  Zero credit; adds tests, this specification and evidence only; no production source, sealed evidence, retained RED or existing test is edited
  plan-page.js is browser-only and stays unmeasured until U010; this item does not claim it

  Scenario: The unmet bar is measured per file with the existing tests
    Given the accepted C004 suites plan.test.cjs and integrity.test.cjs
    When Node measures plan-fixtures.js and plan-provenance.js separately with the L-0004 command at 85/85/85
    Then both commands exit 1
    And only the branch percentage is below the bar, at 70.00 and 83.33, while lines and functions already pass
    And the uncovered branches are the browser-global registration and the two fail-closed returns of the fixtures

  Scenario: The provenance record registers itself as one read-only browser global
    Given the real plan-provenance.js is run as a plain script in a fresh context that has no module, require or window
    When the script finishes
    Then exactly one global appears and it is named C004Provenance
    And its content equals the CommonJS export of the same file
    And the record is deeply frozen, so nested pins cannot be edited
    And the global cannot be reassigned or redefined by a later script

  Scenario: The fixtures register themselves from the loaded C002 fixture and C003 matrix
    Given the real plan-fixtures.js is run as a plain script after the real C002 fixture and C003 matrix are globals
    When the script finishes
    Then exactly one global appears and it is named C004Fixtures
    And local reuses the C002 fixture object itself and is resource-free with not-applicable pricing
    And native names the one C003 row flagged firstPlannedNativeTarget and keeps pricing missing
    And the content equals the CommonJS export of the same file
    And the record is deeply frozen and the global cannot be reassigned or redefined

  Scenario Outline: The fixtures fail closed when their dependencies are missing or unusable
    Given the real plan-fixtures.js is run as a plain script where <dependency state>
    When the script finishes
    Then C004Fixtures is the frozen record with unavailable true and nothing else
    And no local or native example is offered, so no partial example can reach the page
    Examples:
      | dependency state                                                |
      | the C002 synthetic fixture was never loaded                     |
      | the C003 matrix was never loaded                                |
      | neither dependency was loaded                                   |
      | the C002 fixture global is null                                 |
      | the C003 matrix has no rows property                            |
      | the C003 rows property is null                                  |
      | the C003 rows property is an array-like object                  |
      | the C003 rows property is text                                  |
      | the C003 matrix has no row flagged firstPlannedNativeTarget     |
      | the C003 matrix has an empty rows array                         |

  Scenario: Complete data is never mistaken for unavailable
    Given the real C002 fixture and the real C003 matrix
    When the fixtures are registered
    Then unavailable is absent
    And the native example names the flagged row even when that row is last, and follows the flag when another row carries it

  Scenario: The archived RED keeps its evidence
    Given the RED manifests under evidence\k-c004-branch-coverage
    Then each transcript hashes to the recorded SHA-256 and gzip digest
    And each records exit code 1 and a branch percentage below 85 for its file
    And each lists the SHA-256 of every input it measured
