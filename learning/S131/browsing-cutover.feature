Feature: S131 anonymous browsing across a fictional deployment cutover
  All version, asset, cache, route, render, readiness, session, timing and journey
  observations are fixed fictional teaching DATA ONLY.
  The standalone lesson makes no Azure, SWA, registry or management calls.

  Background:
    Given the exact S131 source requires a complete page and pre-cutover assets
    And A-S131 belongs to SC-S131 as one original frozen S unit
    And old HTML references required v1 stylesheet, script and image assets
    And a new anonymous page references required v2 assets after cutover
    And the original fictional page budget is a typed integer 100 through 5000 ms

  Scenario: HTML success is insufficient evidence
    When I capture old HTML with a fictional status of 200
    And I verify before observing either complete rendered page
    Then the verification is unverified
    And no successful transition is counted

  Scenario: Retained assets preserve both browsing journeys
    Given I choose the retained-assets fixture and confirm DATA ONLY
    When I capture old HTML, check readiness and record cutover
    And I load the old references after cutover
    And I load and render the new page
    Then both version-correct required-asset and rendered-page checks pass
    And both fictional anonymous browsing contexts and original budgets pass
    And the synthetic transition is uninterrupted
    And actual local v1 and v2 CSS, script and image fixtures render in the browser

  Scenario Outline: A nominal cutover and HTTP 200 do not erase known interruptions
    Given I choose "<fixture>"
    When I conduct all admitted steps and verify the fixed observations
    Then the verification fails and the user transition is interrupted
    And the failed journey stays in the attempted denominator
    And the exercise detecting that failure is not called an uninterrupted journey

    Examples:
      | fixture            |
      | missing-old-script |
      | missing-new-image  |
      | wrong-cache-version|
      | render-defect      |
      | lost-browse-context|
      | slow-html-200      |

  Scenario Outline: Missing evidence is not manufactured from nominal success
    Given I choose "<fixture>"
    When I conduct all admitted steps and verify the fixed observations
    Then the verification is unverified
    And the missing required observations remain explicitly unknown

    Examples:
      | fixture               |
      | unknown-page-receipts  |
      | unknown-routing       |
      | unknown-readiness     |

  Scenario: A candidate without readiness is not exposed
    Given the fixed readiness observation is false or unknown
    When I check readiness
    Then recording cutover is denied without changing state
    And verification cannot claim a successful transition

  Scenario: Strict input and issued-state guards
    When a command contains coerced consent, an unknown fixture, extra fields,
      a string budget, a forged state, a repeated step or an out-of-order action
    Then the exact typed command is rejected without changing retained history

  Scenario: Reset and keyboard operation preserve evidence
    Given I have observed a failed or unknown run
    When I use the keyboard to reset and start a different run
    Then default controls return without shadowing the native form reset method
    And the earlier observations and verdicts remain in the bounded history
    And at most six runs and three advancing verifications per run are admitted

  Scenario: Errors and CSP are observable in the actual browser
    When an input is invalid or the model fails to load
    Then an accessible error is visible and no success is manufactured
    And the actual browser denies inline script, eval and local connection attempts
    And normal verification does not rewrite source or historical evidence
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately appends unique raw proof
