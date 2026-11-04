Feature: C037 compares requested routing with observed destinations without inventing evidence
  Original C037 is S / P0 / LP-REPLAY, parent H007, gated by independently accepted C036.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario: Requested weights are not observations
    Given a declared fictional policy with exact weights but no started requests
    When the local comparator evaluates it
    Then observed destination counts remain zero
    And the zero denominator is UNOBSERVED / HOLD, never a successful routing result

  Scenario: Historical actual HTTP evidence has no current policy or identity
    Given unchanged pinned C034 saved client requests and their observed response stamps
    When the historical source is inspected
    Then acknowledged destinations are counted as historical actual local HTTP observations
    And requested policy remains UNOBSERVED
    And no authenticated run, user, lease or cohort association is inferred
    And no historical request enters current metrics

  Scenario: Only explicitly fictional measurements can match a declared fictional policy
    Given a finite closed v1 and v2 policy whose integer basis-point weights sum exactly to 10000
    And distinct started fictional originals with separately recorded response destinations
    And the unchanged C036 guard verifies its complete fictional context against its owner context
    When shares are compared with an exact inclusive threshold and minimum sample size
    Then a match is labeled a fictional control match, not actual routing or lease proof
    And HTTP 200, versions, readiness and throughput establish no migration or journey success

  Scenario Outline: Unknown originals retain the denominator
    Given a started original whose observation is <state>
    When shares are evaluated
    Then the original remains in the started-request denominator
    And unknown, in-flight and missing-destination counts remain separate
    And incomplete observations HOLD
    Examples:
      | state               |
      | interrupted unknown |
      | still in flight     |
      | missing destination |

  Scenario: A delivery is not another original and failures cannot be erased
    Given duplicated deliveries for an original and a known mismatched comparison
    When the display is reset, an original is retried or a healthy aggregate is offered
    Then deliveries do not add originals
    And replay or conflicting deliveries cannot replace a known outcome
    And the bounded history and failure latch survive reset
    And historical attempts, failures and summary-only replacements remain distinct

  Scenario Outline: Untrusted or incomplete evidence never enters current metrics
    Given <evidence>
    When inspect or compare is requested
    Then known mismatches reject and missing evidence remains UNOBSERVED / HOLD
    And the only current metric transition is after the unchanged C036 current-context guard
    Examples:
      | evidence                                      |
      | wrong run, user, lease, context or namespace   |
      | stale, replayed or other-epoch observations   |
      | wrong tier, version stamp, request or order    |
      | duplicate JSON keys or unsafe numeric literals|
      | typed fields, unknown fields or invalid UTF-8 |
      | missing requested policy or attribution       |

  Scenario: A conductable local interface stays local and preserves proof
    Given Node 22 and the static keyboard-operable inspector
    When inspect, compare, JSON, error, unknown and reset routes are exercised in signed Edge
    Then source, retained evidence and dependencies are unchanged by normal checks
    And CSP blocks active content and connections
    And owned browser closure is awaited in finally
    And only exact CAPTURE_BROWSER_EVIDENCE=1 appends unique raw evidence, including every failure
    And IaC is N/A with no cloud, deployment, authentication, user data or spending
