Feature: C006 searches the unchanged shared source catalog
  C006 is one frozen S unit for H002 in LP-LEARN.
  C003 and C005 are accepted technical prerequisites, not whole-parent release gates.
  The only source-derived catalog is C005's immutable version 1.0.0 module.

  Scenario: Exact title and objective searches
    Given the validated shared catalog of S001 through S150 and W001 and W002
    When I search for the full title "Warm blue-green handoff"
    Then only S001 is returned with its original entry reference and metadata
    When I search for S001's complete shared objective
    Then only S001 is returned

  Scenario: Literal partial matching with deterministic source order
    When I search for "  BLUE-GREEN  "
    Then S001, S124 and S128 are returned in that order
    And matching ignores case and leading or trailing query whitespace
    And matching is a literal contiguous substring of title or objective only
    And IDs, categories, priorities and other metadata are not additional search fields
    And repeated queries do not reorder, duplicate, mutate or rename entries

  Scenario: Empty and no-result queries are distinct from invalid data
    When I search with an empty or whitespace-only string
    Then all 152 original entries are returned in their original order
    When I search for text absent from every title and objective
    Then a successful zero-result status and an understandable empty state appear
    And Reset clears the query and restores all entries without navigation

  Scenario: Invalid inputs fail closed
    When a query is not a primitive string
    Then the reusable primitive throws an explicit query TypeError
    When the catalog or C003 matrix is malformed, absent or incompatible
    Then the reusable primitive throws an explicit catalog TypeError
    And no previous result, count or snapshot availability claim survives in the UI
    And the browser shows an accessible alert rather than silently returning no matches
    And valid data and input recover without stale errors or duplicate event handlers

  Scenario: Search preserves historical and native distinctions
    Then snapshot commit, timestamps and provenance come unchanged from C005
    And accepted portable lesson links reflect that historical snapshot, not local files
    And native runnable and qualified permissions are false for all entries
    And source parents remain planned and incomplete
    And risk stays unclassified with its shared source reason
    And C003 remains the unchanged capability authority

  Scenario: Standalone keyboard and literal rendering
    Given the page is opened directly without a server or installation
    Then search has a label, instructions, visible focus and a polite result count
    And Tab, Enter, the skip link and Reset operate the actual browser DOM
    And literal query and source markup never create executable elements
    And a 320 CSS-pixel viewport has no horizontal page overflow
    And CSP blocks inline code and outbound connections

  Scenario: Bounded reusable delivery and reproducible evidence
    Then a small tested search primitive can be composed later without a copied catalog
    And no C007 host/risk/readiness filters or C008 preparation view is implemented
    And no framework, dependencies, shared edits, cloud actions or IaC are required
    And real browser checks use openIsolatedLesson and await close in finally
    And only CAPTURE_BROWSER_EVIDENCE exactly "1" refreshes browser observations
    And ordinary verification preserves historical evidence
    And intentional RED source snapshots are plain text outside test discovery
