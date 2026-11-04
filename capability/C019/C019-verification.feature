Feature: C019 typed-failure page is verified file by file under Node and in the installed signed Edge
  Training rehearsal - synthetic data - not a live Azure result
  This addendum specifies verification only. Runtime, error codes, actions, C015, the sealed
  Edge 156.0.4314.50 observation, retained RED and every sealed evidence byte stay unchanged.

  Scenario: Every production file proves its own coverage and an unloaded file is zero percent
    Given the production files are enumerated from the namespace as app.js, errors.js, inspect.cjs and recovery.js
    When the coverage verifier runs the pinned Node coverage command once per file with only that file included
    Then each file has its own coverage row, because Node prints no row and exits 0 for a file no test loads
    And a file without a row is reported as 0 percent and fails
    And each file reaches at least 85 percent lines, 85 percent branches and 85 percent functions
    And the exact command, test files, raw output and per-file percentages are archived as new evidence

  Scenario: The browser page code is loadable under Node with a DOM stub
    Given the pinned genuine C015 error bank and a stubbed document that rejects HTML injection
    When app.js initializes
    Then 13 historical failures are selectable and the console starts uninspected, with no allowed action
    And inspecting each failure shows its exact typed code, outcome, reason and explicit unknown context
    And no element ever shows recovery confirmed or write authorized as true, and no success outcome exists

  Scenario: Page actions stay bounded read-only steps
    Given an inspected held failure
    When the learner reinspects three times, confirms that review is needed, injects a fourth read or a forbidden action
    Then the fourth read and the forbidden action reject visibly and append history
    And stop disables every action and keeps the failure and all history entries
    And reset collapses the details, returns focus to the case selector and preserves the failure, reads and history

  Scenario: The page fails closed when its historical bundle cannot be trusted
    Given a bundle with a wrong schema, mode, capture id, date, extra field, changed code or missing dependency
    When app.js initializes
    Then every control is disabled and the rejected status and canonical state are shown
    And the untrusted values are never rendered
    And per-case checks still reject an unknown, duplicate, relabeled or non-genuine case even if the digest pin were bypassed

  Scenario: History stops at its ceiling without eviction
    Given 47 retained history entries
    When one more observation arrives
    Then the 48th entry is a history-limit stop, the page shows 48 / 48 and offers no action
    And entry 1 is still present and further clicks append nothing

  Scenario: The installed Microsoft-signed Edge is qualified by signature and major version
    Given the isolated helper whose published SHA is unchanged and an installed Edge that updated within the qualified major
    When the real headless Edge observes index.html through the 14 sealed observation groups
    Then the Authenticode signature is valid and signed by Microsoft Corporation
    And the file version major equals the qualified major 156 and the helper reports the same version
    And the actual version and msedge.exe SHA-256 are recorded, never compared with a recorded constant
    And no page error, non-file request or leftover browser exists after the awaited close
