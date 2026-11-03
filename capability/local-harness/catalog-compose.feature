Feature: One local learner flow over the accepted historical catalog
  OP-CATALOG-COMPOSE is necessary zero-credit integration of C005/C006/C007/C008.
  It does not complete H002, H001 or any source parent, or authorize native work.

  Scenario: Search, AND-filter, prepare and conduct accepted portable practice
    Given the unchanged accepted C005 catalog, C006 search, C007 filters and C008 preparation
    When I search for "blue-green"
    And select host "aks", risk "unclassified" and readiness "portable-available"
    Then the original S001 entry matches in its original source order
    And its host support remains unknown, risk unclassified, native unavailable and parent incomplete
    When I open S001 preparation
    Then I can inspect its exact objective, implementation, acceptance, BASE and additional prerequisites
    And its exact shared source limits, pinned references and unchanged approval boundaries
    When I open its original accepted portable lesson in a separate tab
    And conduct warm-up, handoff, old-work completion, retention and retirement
    Then that lesson reports its synthetic result, not a native Azure result
    And closing the lesson returns me to preparation and then the same query and filters

  Scenario: Preserve unknowns and explain explicit source host conflicts
    When I combine a query with host, risk and readiness filters
    Then matching and excluded entries are intersections of the unchanged C006 and C007 results
    And explicit host conflicts have a separate ordered list and their original reasons
    And portable preparation remains accessible on excluded entries
    And no priority, format or prerequisite filter is invented

  Scenario: Empty and unsuccessful searches are not provider errors
    When I use a whitespace query and default filters
    Then I see S001 through S150 followed by W001 and W002
    When I use a literal query with no matching title or objective
    Then I see a successful zero-result state with no stale preparation
    When I reset
    Then the query and all filters clear and focus returns to search

  Scenario: Missing, incompatible or invalid providers fail closed
    Given a preparation is open
    When shared validation fails, a provider is absent or incompatible, or selection is invalid
    Then old results, preparation, links, snapshot and authority claims clear immediately
    And an alert distinguishes unverified data from no matching entries
    And later control changes or reset cannot resurrect an older valid mount
    And a slower obsolete preparation cannot overwrite a newer query or reset

  Scenario: Local accessible literal rendering retains all evidence boundaries
    Then native keyboard controls, visible focus, live counts and back navigation work
    And the page reflows at 320 pixels without horizontal overflow
    And source and query markup render as literal text
    And the content policy blocks inline code and connection attempts
    And availability is explicitly the historical C005 snapshot, never live state
    And native, IaC, scaffolding, identity, deployment and spend remain unapproved
    And production Node.js 24 remains unvalidated
    And ordinary tests do not refresh committed browser observations
