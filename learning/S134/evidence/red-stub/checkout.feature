Feature: Select one correct fictional checkout ledger after response loss
  A-S134 / D-S134 / SC-S134 / frozen S / original kanoUnit A-S134.
  Source S134: Produce one order with the correct result despite retries or routing changes.
  Backlog acceptance: Exactly one intended order/effect is recorded with a correct client result or explicit unresolved failure.
  Portable objective: Retry checkout after response loss; select the ledger showing one correct order.
  Every checkout, order, payment marker, effect, key, acknowledgement, response,
  identity, route and state observation is fixed fictional teaching DATA ONLY.
  This lesson performs no payment, business, user-data, network or database operation.

  Background:
    Given the exact banner "Training rehearsal - synthetic data - not a live Azure result"
    And the only checkout input is the exact string "CHECKOUT-DEMO-01"
    And an initial missing acknowledgement leaves the first attempt outcome unknown
    And alternative ledgers are separate fictional cases, not cumulative orders
    And four measured runs and sixteen actions are the entire in-memory budget

  Scenario: Recover a correct client result without erasing the response loss
    When I load the fixed checkout, reveal retry DATA and inspect the ledgers in order
    And I select "kept-key"
    Then exactly one matching order, effect and fictional payment marker are measured
    And the retry has the same key, identity and cart state and a matching acknowledged response
    And the bounded result is positive
    And the original interruption and initially unknown effect outcome remain in history

  Scenario Outline: Detect known incorrect checkout ledgers
    When I load the fixed checkout, reveal retry DATA and inspect the ledgers in order
    And I select "<ledger>"
    Then the measured result is negative, not a correct checkout
    And the original interruption is retained
    Examples:
      | ledger         |
      | fresh-key      |
      | wrong-response |
      | lost-state     |
      | wrong-identity |

  Scenario Outline: Missing acknowledgements are neither success nor failure
    When I load the fixed checkout, reveal retry DATA and inspect the ledgers in order
    And I select "<ledger>"
    Then the client result is explicitly unresolved and the measured result is unknown
    And no failed or successful order is inferred from a missing acknowledgement
    And unknown counts are not converted to zero
    And neither an unknown effect nor a missing acknowledgement permits a duplicate order
    Examples:
      | ledger         |
      | unacknowledged |
      | unobserved     |

  Scenario: Preserve prior negative and unknown measurements during later recovery
    Given I measured "fresh-key" and "unobserved"
    When I subsequently measure "kept-key"
    Then all three runs and their interruptions and unknown observations remain
    And no recovery rewrites a previous result

  Scenario: Reject malformed inputs and forged or out-of-order state without mutation
    When a token is coerced, whitespace-adjusted, inherited, accessor-backed or out of the allowlist
    Or a command, state, history or measured result is forged
    Or I select before inspection or exceed sixteen actions
    Then an explicit typed-input, state or limit error holds the current state and retained history

  Scenario: Observe genuine browser keyboard, reset, error and CSP behavior
    When I operate the native labeled controls with Tab, Enter and Space
    Then focus, alerts, semantic action guards and measured ledgers are actually observed
    When I explicitly reset the in-memory lesson
    Then all sixteen-action history is cleared and the exact token and initial focus return
    And native reset uses the form prototype, not a shadowed form.reset property
    When the model resource is missing
    Then a visible initialization failure disables all actions
    And real browser CSP blocks inline script, eval, inline style, connections, images, frames and form submission

  Scenario: Evidence and native boundaries
    Given a loadable stub precedes a genuine failing behavioral assertion
    Then the exact stub, assertion and raw RED stay outside normal test autodiscovery
    And IaC is evaluated N/A after RED for this resource-free fixed-data lesson
    And ordinary verification is read-only
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates new exclusive browser evidence
    And the published isolated helper is pinned and close is awaited in finally
    And B-S134, D-S134, Node 24 production and live Azure acceptance remain incomplete
    And the parent alone may accept this original A-S134 unit once with zero extra credits
