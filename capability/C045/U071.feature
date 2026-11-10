Feature: C045 exact reviewed producer lineage without silent repinning
  Scenario: Original and reviewed private producer bytes remain distinguishable
    Given the unchanged eleven original dependency pins
    And only the two exact parent-reviewed C041 replacements
    Then original and exact reviewed raw, LF and CRLF forms are accepted
    And changed bytes and unknown versions are refused by name
    And no future commit, tag or wildcard authority is invented

  Scenario: Historical proof and actual current files are checked separately
    Given byte-exact historical source witnesses
    Then every old captured input is verified against its explicit version
    And every actual current namespace file is independently enumerated and checked
    And an unknown current file or an edited original record is refused
