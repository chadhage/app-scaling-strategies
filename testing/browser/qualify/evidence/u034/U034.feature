Feature: Admit only the freshly requalified installed Edge major
  The sealed qualified list and all seven qualification implementation files remain unchanged.
  The existing addendum CLI is the only writer of the new qualification entry.
  Qualification is not application, publication, Azure, deployment, or lifecycle-change authority.

  Scenario: The retained admission assertions expose the actual missing qualification
    Given the sealed qualified majors are [156] and no addendum exists
    And the installed Microsoft-signed Edge reports major 157
    When the actual qualification CLI checks the installed binary
    Then its sole failure is MAJOR_NOT_QUALIFIED
    And the unchanged retained known157 admission assertion genuinely fails
    And the unchanged retained unknown158 denial assertion passes

  Scenario: A fresh actual requalification authorizes exactly one append
    When the existing requalification CLI executes the isolated and loopback suites
    Then all 8 isolated tests and all 5 loopback tests run and pass
    And no test is skipped, cancelled, or todo
    And both suites print the exact installed Chromium version
    And the binary path, version, SHA-256, and valid Microsoft signature remain unchanged
    And the CLI still exits 1 with MAJOR_NOT_QUALIFIED alone
    When the existing addendum CLI validates that fresh report in dry-run mode
    And the existing addendum CLI appends that report exactly once
    Then the chain check succeeds and the sealed list remains [156]
    And actual qualifyEdge admits major 157 through the addendum
    And the unchanged retained admission assertions both pass
    And unknown major 158 remains denied

  Scenario: Real adopters finish without rewriting historical evidence or changing their source
    Given actual qualifyEdge admits the installed browser through the addendum
    When all actual U005 and U006 reader tests run first
    Then each reader executes every test without skips
    And its exact raw records and owned cleanup verdict are recorded immediately
    And reader completion confers no lifecycle-application authority
    When the actual X001, C009, C043, and C059 browser commands run unchanged
    Then all four commands pass on the installed qualified major
    And the browser-evidence capture selector remains absent
    And original source, imports, and historical evidence remain byte-identical
    And the full existing hermetic, machine-API, evidence, and amendment-proof suites pass
    And outside consumers use the owning qualification API rather than reading the sealed list
