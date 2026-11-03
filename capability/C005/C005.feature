Feature: Browse the source catalog without implying native completion
  C005 / H002 / frozen Kano S / one original unit

  Scenario: Every canonical source entry is discoverable
    Given the pinned README and backlog contain S001 through S150 and W001 and W002
    When a visitor opens the local catalog
    Then exactly 150 distinct source scenarios and two guided workflows are shown
    And titles, objectives, priorities, prerequisites and source locations are source-derived
    And the reusable catalog contract validates before any cards are rendered

  Scenario: Acceptance is a committed historical snapshot, not file discovery
    Given availability was extracted with read-only git show from a pinned committed ledger
    When the visitor browses an entry
    Then a portable lesson is linked only with accepted Done review and publication evidence
    And the as-of commit, commit time and ledger update time are disclosed
    And a file or published-but-unaccepted card is not promoted to available
    And snapshot availability is never described as live

  Scenario: Portable learning, native execution and source parent completion differ
    Given C003 owns the documented-only host-format matrix and C001 owns approvals
    When an entry has an accepted synthetic lesson
    Then native qualification and native execution still remain false
    And the original source parent is still incomplete
    And unknown target support has an explicit reason and a link to C003
    And no cloud, IaC, scaffold, identity, deployment or spending action is offered

  Scenario: Browsing is keyboard accessible and fails closed
    Given the catalog is open in an actual isolated headless browser
    When the visitor follows category and accepted-lesson links with the keyboard
    Then focus is visible and source identifiers remain unambiguous
    And malformed, incompatible or empty data clears stale cards and exposes an alert
    And blocked scripts cannot replace source text with markup

  Scenario: Later catalog cards share data, not duplicated extraction
    Given the immutable catalog-data.js module has contract version 1.0.0
    Then C006 can consume its titles and objectives
    And C007 can consume its source priority and dependencies plus explicit unknown risk
    And C008 can consume its source acceptance, prerequisites and shared limits
    But C005 does not implement search, filtering or preparation views
