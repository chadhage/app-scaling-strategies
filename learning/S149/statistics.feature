Feature: Fixed fictional five-nines evidence, not real certification
  Every request, user, event, original journey, recovery, count and assumption
  is fixed fictional teaching DATA ONLY. No trials or live operations run.

  Scenario: Distinct counting units cannot replace attempted transition journeys
    Given a fixed record with 5,991,440 requests, 149,786 users and one shared event
    And 299,572 started transition journeys share dependent exposure
    When the operator compares REQUEST, USER, EVENT and JOURNEY
    Then the journey denominator stays 299,572
    And none of the diagnostic counts supplies independent comparable trials
    And the confidence upper bound is unavailable
    And the insufficient-evidence and correlation warnings remain visible

  Scenario: Exact minimal illustrative sample size under explicit assumptions
    Given zero failures in independent comparable completely observed Bernoulli journeys
    When the operator checks the one-sided 95 percent bound
    Then p_upper is -expm1(log(0.05) / n)
    And the minimal integer n is ceil(log(0.05) / log1p(-0.00001)) = 299572
    And n = 299571 exceeds 0.00001
    And n = 299572 is at or below 0.00001
    And the conclusion is conditional mathematical illustration, not an Azure SLA or certification

  Scenario: Large requests and a small complete sample remain insufficient
    Given 6,000,000 successful diagnostic requests but only 1,000 qualifying journeys
    When the operator selects JOURNEY and checks the evidence
    Then the observed journey success fraction is 1
    But the upper interruption probability exceeds 0.00001
    And zero observed failures does not prove five-nines reliability

  Scenario Outline: Original started outcomes cannot disappear after recovery
    Given four original started journeys with <successes> successes, <failures> interruptions and <unknowns> unknowns
    And a separate later usability recovery exists
    When the operator checks the fixed record
    Then the denominator remains four
    And the original outcomes and recovery remain separate
    And no zero-failure confidence bound is assigned
    Examples:
      | successes | failures | unknowns |
      | 3         | 1        | 0        |
      | 3         | 0        | 1        |
      | 2         | 1        | 1        |

  Scenario: Empty or incomparable evidence cannot acquire confidence from counts
    Given an empty journey sample or explicitly incomparable contexts
    When the operator inspects and checks the record
    Then empty rates and unqualified upper bounds are null, not 100 percent or zero
    And independence, comparability and complete observation are not proven by aggregate counts

  Scenario: Strict typed revision guards and retained teaching history
    Given a bounded session of at most twelve exercises
    When a malformed choice, stale command, duplicate check or forged history is submitted
    Then it is rejected before mutation
    And archive/reset retains prior wrong answers, unknown outcomes and interruptions
    And later correct answers cannot erase previous failures or pool fixed records as new trials

  Scenario: Actual local browser conduct
    Given the exact training banner and external-only restrictive CSP
    When the operator uses Tab, arrows, Enter and Space
    Then fixed records, exact counts, rates, assumptions, upper bounds and warnings are inspectable
    And invalid choices focus labelled inputs and guarded actions focus an alert
    And reset restores controls without shadowing form.reset or discarding history
    And script, style and connection violations are actually blocked

  Scenario: Deliberate evidence capture and read-only normal verification
    Given the exact published isolated helper and approved offline tooling
    When CAPTURE_BROWSER_EVIDENCE is not exactly 1
    Then verification changes no owned bytes and creates no evidence
    When deliberate capture uses exactly CAPTURE_BROWSER_EVIDENCE=1
    Then every raw attempt has a unique preserved directory including failures
    And awaited finally close is recorded without claiming qualified lifecycle recovery
