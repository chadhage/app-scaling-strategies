Feature: K-C008 repays the C008 preparation.js coverage debt with behavioral tests of the unmeasured browser paths
  K-C008 / worker-K-C008 serves C008 [S]
  Zero credit; adds tests, one spec, one README and evidence only; no production source, sealed evidence, retained RED or existing test is edited
  preparation-page.js is browser-only and stays unmeasured under Node until U010; K-C008 does not claim it

  Scenario: The accepted C008 tests leave the browser-global and fail-closed paths of preparation.js unmeasured
    Given the L-0004 coverage command over capability\C008\preparation.js with the accepted non-browser tests
    When it runs with the 85 percent line, branch and function thresholds
    Then it exits 1 with 79.59 percent lines, 79.17 percent branches and 83.33 percent functions
    And the uncovered lines are the browser-global attachment, the missing C005 validator answer, the missing C001 approval or guard answer and the invalid integrity verdict mapping

  Scenario: The page composition loads the real shared authorities in index.html order and exposes one frozen read-only API
    Given the dependency scripts listed before preparation.js in index.html are executed in a browser-like global in that order
    When preparation.js is executed as the page does, without a module object
    Then the global C008Preparation exists with exactly one member, prepare
    And the global cannot be replaced, deleted or enumerated, and the API object is frozen

  Scenario: The page composition prepares every source entry with the same answer the Node module gives
    Given the browser-like global holds the real C005 catalog, C003 matrix and C001 approval with the real integrity guard
    When prepare is called with each of the 152 source IDs
    Then every answer is ready and carries the global's own catalog, matrix and approval objects
    And accepted portable lessons are synthetic-learning, the two workflows are unsupported-learning and every other scenario is unavailable-learning
    And an empty selection is empty and a noncatalog selection is an error that names the exact source ID rule

  Scenario: A page without the C005 validator never infers a replacement catalog
    Given the browser-like global has no usable C005 validator: absent, empty, not callable or throwing
    When prepare is called with a valid catalog, matrix and source ID
    Then the state is error with no entry and no approval
    And the missing or broken validator is named, never replaced by an inferred validation

  Scenario: A page without a usable C001 approval or integrity guard never shows an approval
    Given the browser-like global has a valid C005 validator but lacks the C001 approval artifact, the guard, or a callable validateApproval
    When prepare is called with a valid catalog, matrix and source ID
    Then the state is error with no entry and no approval
    And the error states that the approval artifact or its integrity guard is unavailable

  Scenario: The real integrity guard refuses a drifted or unverifiable approval and every reason reaches the visitor
    Given the real C001 guard runs in a global whose bundled approval was changed, or whose WebCrypto is unavailable
    When prepare is called with a valid catalog, matrix and source ID
    Then the state is error with no entry and no approval
    And each guard reason appears as its code, a colon and its message, in the guard's order
