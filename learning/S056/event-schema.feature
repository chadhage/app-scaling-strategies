Feature: Check event-schema compatibility before introducing a new producer
  A-S056 / D-S056 / SC-S056; frozen Kano S; SOURCE; synthetic only.
  S056 requires new producers to remain compatible with old consumers during overlap.
  Each matrix cell is an independent synthetic consumer journey, not a broker delivery.

  Background:
    Given the visible label "Training rehearsal - synthetic data - not a live Azure result"
    And an old producer intends a 1250-cent credit and a new producer intends a 2500-cent credit
    And both old and new consumers must interpret their events and apply the intended integer-cent credit
    And four manually advanced checks cover old-to-old, old-to-new, new-to-old and new-to-new
    And no accounts, credentials, registrations, network calls or live services are involved

  Scenario: Introduce an additive producer only after complete compatibility evidence
    Given the new producer retains amountCents and adds currency
    And the old consumer tolerates unknown fields
    And I choose all consumer contracts and business effects with complete observations
    When I inspect all four checks
    Then all four independent journeys have correct effects
    And their expected and observed test-ledger sums are both 7500 cents
    When I request introduction
    Then the synthetic introduction succeeds

  Scenario: Block a renamed field that the old consumer cannot interpret
    Given the new producer replaces amountCents with amountMinor
    When I inspect all four checks and request introduction
    Then the new consumer can read the new event but the old consumer cannot
    And the result is failure and introduction remains blocked

  Scenario: Shape compatibility does not prove business correctness
    Given the new producer puts 25 dollars into an integer field named amountCents
    When I choose full checks and inspect the matrix
    Then all four payloads are interpretable
    But the new-event effects are wrong and the result is failure
    When I instead choose shape-only checks
    Then unmeasured business effects remain unknown, not success
    And introduction remains blocked

  Scenario: Strict old readers reject an otherwise additive event
    Given the old consumer rejects extra fields
    When I inspect the additive producer with full checks
    Then the new-to-old cell fails and introduction remains blocked

  Scenario Outline: Incomplete evidence never unlocks introduction
    Given I choose <condition>
    When I inspect the bounded checks and request introduction
    Then the result is unknown unless an observed failure already exists
    And absent old-consumer or business-effect evidence is explicitly visible
    And introduction remains blocked
    Examples:
      | condition                         |
      | new-consumer-only coverage         |
      | shape-only compatibility checks    |
      | withheld old-consumer observations |

  Scenario: A successful new consumer cannot erase an observed old-consumer failure
    Given the renamed producer and full checks
    When the old consumer fails before the new consumer succeeds
    Then the aggregate remains failure and introduction is blocked

  Scenario: Exact guards reject invalid input, stale evidence and forged state
    Given an invalid choice, an extra input property or a modified matrix receipt
    When I request an action
    Then an explicit handled error is shown
    And the prior trace, effects and retained history do not change
    And checking before start, early introduction and repeated introduction are rejected

  Scenario: Predictions are not compatibility results
    Given a decided attempt
    When I check one prediction
    Then PASS or FAIL describes only prediction accuracy
    And it cannot change the measured outcome or introduce a blocked producer

  Scenario: Bounded retained history and keyboard reset
    Given up to eight decided attempts remain visible with configurations, matrix receipts and outcomes
    Then no older attempt is silently discarded and a ninth start is rejected
    When I use keyboard controls to reset all
    Then defaults, trace, prediction, errors and history are cleared and focus returns to the first choice
    And the form's native reset method is still a function

  Scenario: Restrictive local content policy
    Given a browser-openable file lesson with local external JavaScript and CSS
    Then inline script, inline handlers, connections, frames and form submission are denied by CSP
    And deliberate browser probes demonstrate denial without allowing outbound requests
