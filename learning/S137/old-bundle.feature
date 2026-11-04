Feature: Reuse an old cached/service-worker frontend against a new backend
  A-S137 is one original, frozen S unit in SC-S137 under D-S137.
  Source S137 requires support for an older client bundle talking to the new backend.
  D-S137 requires supported existing bundles/assets/contracts and detected stale-client
  failures rather than silent UI corruption. Dependencies: D-S051 and D-S057.
  All bundle, service-worker, cache, asset, API, state, backend and version observations
  are fixed fictional teaching DATA ONLY. No actual service worker is installed.

  Background:
    Given a standalone local lesson with the exact banner
      "Training rehearsal - synthetic data - not a live Azure result"
    And an immutable fictional v1 client, v1 worker/cache lineage, old asset content IDs,
      catalog-v1 API contract, ui-draft-v1 state and a safe "Paper star × 2" view
    And a finite envelope of 12 measured runs, 64 accepted actions and 12 latest errors
    And no actual cache, API request, storage, deployment, cloud resource or business effect

  Scenario: Loadable stub gives genuine behavioral RED before implementation
    Given a syntactically loadable model and a keyboard-loadable local page
    When the operator pins the original old client
    Then the phase must change from idle to pinned
    And an implementation that remains idle fails a real ERR_ASSERTION
    And raw RED and stub bytes are archived outside normal test autodiscovery
    And IaC is evaluated N/A after RED and before implementation

  Scenario: Compatible old bundle remains usable after a fresh backend
    Given the fixed preserved observations
    When the operator pins the old bundle, cuts over to teaching-backend-v2 and measures
    Then the same old bundle ID remains selected
    And all seven compatibility checks pass using the fictional recorded data
    And the old asset content IDs, old API shape, draft and rendered view remain compatible
    And the outcome is POSITIVE for this synthetic fixture only

  Scenario Outline: HTTP 200 does not hide a broken stale client
    Given the fixed <preset> observations with a fresh backend and HTTP 200
    When the operator pins, cuts over and measures the old bundle
    Then at least the <check> compatibility check fails
    And the outcome is NEGATIVE
    And the failed candidate view is withheld, retaining the safe old view
    And earlier run results are not overwritten
    Examples:
      | preset            | check              |
      | api-shape-break   | old-api-contract   |
      | missing-old-asset | old-assets         |
      | changed-old-asset | old-assets         |
      | lost-client-state | retained-state     |
      | corrupt-render    | render-integrity   |

  Scenario Outline: Missing continuity evidence stays UNKNOWN
    Given the fixed <preset> observations
    When the operator pins, cuts over and measures
    Then backend freshness and an HTTP 200 alone cannot certify compatibility
    And no missing observation is treated as a successful check
    And the outcome is UNKNOWN and the candidate view is withheld
    Examples:
      | preset        |
      | backend-only  |
      | cache-unknown |

  Scenario: Strict input, state and action-order guards do not mutate accepted state
    Given a canonical bounded state reconstructed from its accepted history
    When an action is out of order, unknown, mistyped, extra-keyed or accessor-bearing
      or a state has a forged result, changed bundle, bad count or impossible event
    Then the action is rejected with a clear error rather than coerced or accepted
    And no accepted result or history entry changes

  Scenario: Keyboard, reset, error and dependency failure UX are observed in a real DOM
    When the operator uses Tab, Enter and Space for the labeled controls
    Then focus is visible, status is live and errors are announced
    And reset returns to idle and the default preset without shadowing form.reset
    And reset retains measured results, accepted history and latest rejected actions
    And a blocked model dependency produces an accessible fail-closed error
    And reloading the local page restores the lesson without claiming persistent storage

  Scenario: CSP and proof scope are honest
    Given restrictive CSP before local resources with worker-src and connect-src none
    When an unapproved inline script is inserted during the isolated browser test
    Then an actual script-src CSP violation is observed and the script does not execute
    And no worker or service-worker probe is used as native proof
    And file-origin Worker rejection alone is not worker-src or real service-worker proof
    And normal verification is READ-ONLY for lesson and existing proof bytes
    And only exact CAPTURE_BROWSER_EVIDENCE=1 permits a unique append-only capture
    And the published isolated helper is hash pinned and awaited in finally close

  Scenario: Only the parent accepts this original teaching unit once
    Then B-S137 and D-S137 native/source acceptance remain incomplete
    And Node 24 production, actual Azure and native service-worker behavior remain unvalidated
    And relevant source remainder is documented with readiness=false until native gates exist
    And test, repair, proof and refinement produce zero extra Kano credits
