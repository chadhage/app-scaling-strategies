Feature: One public evidence boundary protects fictional held values
  Scenario: Registered values overlap
    Given suffix-prefix, chained and self-overlapping fictional values
    When the original text crosses their occurrence intervals
    Then their interval union is replaced once without a surviving fragment
    And an encoded neighbour still masks the whole original value

  Scenario: A fictional phone retains its literal plus
    Given a held phone with a literal plus and spaces
    When spaces alone are replaced by plus signs
    Then anonymous public evidence contains none of that form

  Scenario: Numeric encodings have leading zeroes
    Given numeric entities and braced escapes with zero padding
    When the significant value is a Unicode code point
    Then padding does not hide a held value
    And invalid values remain undecoded

  Scenario: Refusal writes are observed on the server
    Given twelve flooding visitor connections
    When all twelve connections have quiesced
    Then exactly twelve typed 403 writes were made
    And each client read either 403 or no status before reset

  Scenario: Verification assertions are independent
    Then content types are compared with literal media types
    And route anchors and page identifier bounds have negative controls
    And missing environment prerequisites are named skips, not passes

  Scenario: No vacuous behavioral pass
    Given executed tests with either assertions or explicit prerequisite skips
    Then a separate assertion census reports their actual counts
    And an executed empty leaf makes that census fail

  Scenario: A mutated occurrence search cannot run forever
    Given an incorrect not-found sentinel in the occurrence loop
    Then a counted search barrier fails a named assertion
    And no timeout is treated as a mutation kill
