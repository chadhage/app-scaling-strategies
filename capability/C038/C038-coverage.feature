Feature: Enforce the per-file coverage bar over every C038 production file
  Original C038 stays frozen S / P0 / LP-REPLAY; this specification adds no credit.
  Standing rule 5: every production file reaches at least 85% line, 85% branch and
  85% function coverage, measured per file over an enumerated set. A file that no
  test loads counts as 0%. Thresholds are never lowered, waived or met by exclusions.
  Training rehearsal - synthetic data - not a live Azure result.

  Scenario: The production file set is enumerated from the namespace, not left to Node
    Given the relative paths of every file in the C038 namespace
    When the gate enumerates production files
    Then boundary.cjs, cli.cjs, model.js, page.js, readiness.js and sources.cjs are listed
    And tests, evidence, retained RED subjects, markup, styles, PowerShell and data are not listed
    And a nested production-looking script fails closed instead of escaping measurement

  Scenario: An enumerated file that no test loaded counts as 0% and fails
    Given a Node coverage report with no row for page.js
    When the report is evaluated against the enumerated files
    Then page.js is reported as not loaded with 0 lines, 0 branches and 0 functions
    And the gate fails with the unloaded reason visible

  Scenario: A low file is never hidden by a high aggregate
    Given cli.cjs at 69.23 lines and 42.86 branches while the aggregate passes 85
    When the report is evaluated per file
    Then the gate fails and names cli.cjs with the exact metrics below the floor

  Scenario Outline: Each metric is a hard per-file floor
    Given a file at <value> <metric>
    Then the gate result is <result>
    Examples:
      | metric    | value | result |
      | lines     | 85.00 | passed |
      | lines     | 84.99 | failed |
      | branches  | 85.00 | passed |
      | branches  | 84.99 | failed |
      | functions | 85.00 | passed |
      | functions | 84.99 | failed |

  Scenario: No earlier threshold is lowered
    Given the earlier gate required 90 lines, 80 branches and 90 functions on readiness.js and model.js
    Then those two files keep the 90 line and 90 function floors and gain the 85 branch floor
    And every other production file has the 85 / 85 / 85 floor

  Scenario: A measured file outside the enumeration fails closed
    Given the report contains a row for a file that was not enumerated
    Then the gate fails with the unenumerated file named

  Scenario: Every production file reaches the bar with its own behavior tests
    Given page.js loaded under Node against a DOM stub built from the real index.html ids
    And cli.cjs loaded in process with an injected fixture session and captured console output
    And boundary.cjs currentDiagnostic with an archived publisher snapshot and archived State authority
    When the focused tests run under the enumerated gate
    Then all six production files are at or above their floors
    And the nested runner has NODE_TEST_CONTEXT and NODE_V8_COVERAGE removed from its environment
    And no source, retained fixture or evidence byte changes during an ordinary run

  Scenario: Non-JavaScript production assets are reported honestly, never as covered
    Given index.html and style.css are observed in a real headless Edge
    And read-gates.ps1 is exercised by the State-reading tests but Node cannot instrument PowerShell
    Then the gate output lists them as not measured by Node coverage
    And they are neither counted in the percentages nor excluded from the stated obstacles
