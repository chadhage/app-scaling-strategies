Feature: Distinguish repeated synthetic webhook attempts from one business event
  This is A-S135 / D-S135 / SC-S135, one original frozen Kano S unit.
  All event, webhook, acknowledgement, retry, deduplication, key, state, effect,
  version, elapsed-time and budget values are fixed fictional teaching DATA ONLY.
  No webhook, network, business, user-data, cloud or infrastructure operation occurs.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given one fixed fictional event "fictional-event-135"
    And one intended fixed effect "fictional-effect-135" with the result "correct"
    And its original start is 0 ms and its original budget is exactly 1000 ms
    And at most four rehearsals and sixteen operator actions are retained
    And the exact source says "Process repeated or delayed delivery without duplicate business effects."
    And D-S135 requires "Repeated deliveries preserve one business effect and correct observable processing status."

  Scenario: A loadable stub is behaviorally RED before IaC applicability or implementation
    Given the BDD contract and an openable no-op browser stub
    When the exact typed load command is submitted
    Then a genuine assertion expecting phase "loaded" observes phase "ready" and fails
    And the original stub, raw assertion output and actual browser observation remain outside test autodiscovery
    And IaC is subsequently recorded as N/A for a resource-free fixed-data lesson

  Scenario: A stable event key survives the fictional deployment change
    Given the "stable-key" preset is loaded with the exact event token and numeric budget
    When the operator records cutover to v2
    And redelivers the delayed fixture and measures the original event
    Then two delivery attempts belong to one event
    And the v2 retry is deduplicated with one correct effect and received acknowledgements
    And exactly one business result is positive, not two successes or two effects

  Scenario Outline: An observed contract violation is negative even with an acknowledgement
    Given the "<preset>" preset
    When load, cutover, redelivery and measurement complete
    Then the event result is "negative" because of "<reason>"
    And no delivery attempt is counted as a new correct business result
    Examples:
      | preset           | reason                                              |
      | versioned-key    | the retry uses a version-scoped key and duplicates an effect |
      | budget-exceeded  | 1250 ms exceeds the original 1000 ms budget          |
      | wrong-effect     | one effect has incorrect result and changed state   |

  Scenario Outline: A later acknowledged recovery cannot certify an unknown original attempt
    Given the "<preset>" preset
    And the first delivery has "<unknown>"
    When a later v2 retry reports received acknowledgement and one effect
    And the operator measures the original event
    Then its result remains "unknown" and verification remains "unverified"
    And the original unresolved acknowledgement or completion remains in the attempt ledger
    And the later recovery cannot change the original observation into a success
    Examples:
      | preset             | unknown                     |
      | lost-ack           | lost acknowledgement        |
      | unknown-completion | unobserved completion/state |

  Scenario: New positive rehearsal does not erase prior negative or unknown evidence
    Given a measured versioned-key rehearsal and a measured lost-ack rehearsal
    When the operator measures a stable-key rehearsal without resetting
    Then all six attempts, three event results and twelve actions remain retained
    And totals show one positive, one negative and one unknown business result
    And the original unknown and duplicate observations are unchanged

  Scenario: Exact input and replayed state guards fail without mutation
    Given a valid current state
    When a command has wrong types, whitespace tokens, extra keys, accessors, symbols or a custom prototype
    Or an action is out of order, budget is not the fixed safe integer, or history is exhausted
    Or state has forged results, attempts, phases or truncated history
    Then an explicit guard error is returned without mutating the input state or history
    And no positive result is invented

  Scenario: The sixteenth action is allowed and the seventeenth is a safe hold
    Given four fully measured rehearsals
    Then all eight attempts, four results and sixteen actions remain retained without pruning
    When another load is requested
    Then reset is explicitly required and evidence is unchanged

  Scenario: Keyboard, error, reset and unavailable-model experiences are observable
    Given the standalone lesson with labeled controls, visible focus, status and alert regions
    When the operator conducts the exercise with Tab and Enter
    Then enabled controls follow the guarded phase and result tables describe measured evidence
    When malformed input is supplied or the local model is unavailable
    Then an accessible visible error appears without positive results
    When an element named reset shadows the form method and Reset lesson is activated
    Then native prototype reset clears only this page's in-memory rehearsal and restores preset focus

  Scenario: Early narrow CSP is enforced in the actual browser
    Given the local lesson uses only its local scripts and stylesheet
    When evidence-only probes try inline scripts/events, eval, inline styles, data connections, images, frames or form navigation
    Then actual browser violations and blocked behavior are observed without live network or unsafe flags
    And the isolated published helper is pinned and its close is awaited in finally

  Scenario: Normal verification preserves historical proof
    Given archived RED, raw observations and source-byte integrity records
    When the normal focused test command runs with capture unset or not exactly "1"
    Then no source or historical proof is rewritten
    When CAPTURE_BROWSER_EVIDENCE is exactly "1"
    Then only a deliberate uniquely named raw browser capture is exclusively created
    And raw CRLF/LF hashes remain distinct from canonical LF hashes and Git blob identities
