@U007 @zero_credit @append_only
Feature: Bind repaired U007 production without rewriting historical evidence
  The original capture index, seal, verifier helper, raw captures and input
  snapshots stay byte-exact. A current authority is not browser qualification
  or permission to apply live files.

  Scenario: Current source has an explicit chained successor to its retained source
    Given the original U007 capture index and its original source pins
    And the ownership snapshot defect was proved before repair
    When the repaired source is verified
    Then an append-only base, addendum and head bind the exact current source
    And every amended original has a byte-exact retained predecessor
    And the original captures still verify against those original bytes

  Scenario: A tampered current or historical input cannot fall back to another authority
    Given the current authority verifies
    When any current source, retained predecessor, head, addendum or stream is changed
    Then verification reports the named integrity failure
    And missing or malformed authority is a failure, not historical success

  Scenario: Newline representation must have exact recorded provenance
    Given raw and LF-canonical digests are recorded for current source
    When the exact LF-canonical source is verified
    Then its recorded provenance is accepted
    But a partly rewritten mixed-newline variant is refused
