Feature: Source-frozen completion of C059 review residuals
  Production and retained captures are immutable. This continuation changes only
  tests, test tooling and documentation, without accepting or publishing itself.

  Scenario Outline: A queued bodyless cancellation cannot escape a refusal
    Given connection A has a step held by an executor gate
    And connection B queues a bodyless cancellation of A's step
    When a <refusal> is parsed in the same write or a later write
    Then B closes with the applicable ordered refusal answers
    And after a third-connection barrier A still answers 201 and succeeds
    And the lease and journal contain only the deliberately completed steps
    Examples:
      | refusal                                      |
      | each reachable Node parser error             |
      | each imported service refusal-table row      |
      | unsupported expectation and missing Host     |
      | asynchronous body and 100-continue refusals   |

  Scenario: Mutation accounting distinguishes evidence from missing evidence
    Given every original mutant and the retained R5 extension
    Then a kill names an assertion or thrown test error with complete TAP counters
    And a timeout, crash or file failure alone is undecided, never a kill
    And the documented per-test cap is 900000 milliseconds
    And each pristine mutation tree is restored and checked after every mutant
    And platform equivalence demonstrations run on real and mutated production

  Scenario: Identifier inventory includes unchanged historical evidence
    Given every namespace file including decoded gzip transcripts is scanned
    Then an immutable historical finding is reported with its accepted blob
    And a planted identifier in an unchanged-looking file is found by name
    And new findings are not excused as historical

  Scenario: One final source phase precedes complete current evidence
    Given source, imports, documentation and tests have one recorded freeze
    Then all subsequent evidence binds that freeze and its actual executed inputs
    And the whole current suite and both integrity gates execute unchanged
    And every loaded first-party production file reaches 85/85/85 separately
    And LF service-free and full CRLF trees pass within the inherited C041 limit
    And real qualified Edge and injected-failure cleanup follow private GREEN
    And historical measurements are never described as new observations
