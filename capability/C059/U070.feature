Feature: C059 exact reviewed producer provenance with truthful history
  Scenario: Only exact original and reviewed producer versions are accepted
    Given the unchanged original nine import pins and their real accepted Git blobs
    And only the two exact parent-reviewed C041 replacement byte pairs
    Then raw and canonical branches admit those versions independently
    And an unknown or edited version is refused by path

  Scenario: Historical captures and current filesystem are distinct evidence
    Given explicit byte-exact historical version witnesses for every old input
    Then every old captured input is checked against its named historical version
    And the original 94-source freeze and every old capture remain unchanged
    And all actual current namespace bytes are independently enumerated and checked
    And unknown files, edited source, altered witnesses and modified old records fail by name
