Feature: Complete parser-derived production mutation domain
  Scenario: Every real production statement has its own deletion position
    Given the exact seven published production sources and an immutable pinned JavaScript parser
    When the complete AST statement domain is independently enumerated
    Then every statement and declaration, including throws, breaks, returns and module initialization, has an exact source-bound deletion binding
    And the server sockets Set declaration is not omitted
  Scenario: Every decision and single constituent condition is bound
    When branch, loop, ternary, switch and short-circuit conditions are independently enumerated
    Then their complete exact source spans have explicit current variants without lexical sampling
  Scenario: A damaged inventory cannot certify completeness
    Then missing, duplicate, extra, wrong-source and wrong-range entries are named failures
    And syntax, unchanged identities, dependency faults, crashes, timeouts and unexecuted variants are never behavioral kills
  Scenario: Valid changed initialization is application behavior
    Given compiled source and all required modules have their actual pinned bytes
    And the identical-environment pristine initialization and export contract passes
    Then the changed module must satisfy its own natural named contract assertion
    And missing dependencies, parser errors and environment faults remain non-kills
