Feature: S040 cookie-less API and mobile continuity
  # A-S040 / D-S040 / SC-S040, frozen Kano S, local synthetic lesson only.
  # Sources read before design: README S040, D-S040 backlog, portable A-card contract.
  Background:
    Given two synthetic clients start on v1 with distinct subjects and retained work
    And each has a fixed original end-to-end budget of 300 milliseconds
    And token markers and cookie records are fixtures, not real authentication

  Scenario: Remove cookies without losing API or mobile continuity
    Given browser cookies are absent
    And the identity rule validates the synthetic bearer subject
    And the API routing policy selects v2 independently of cookies
    And work is shared by subject
    When the operator rehearses the complete trace
    Then both clients reach v2 with their original identity and entire work state
    And both finish within their original budgets
    And the result is success with nine passing checks

  Scenario Outline: Browser assumptions do not establish cookie-less continuity
    Given browser cookies are absent
    And the operator selects <condition>
    When the operator rehearses the trace
    Then the result is failure
    And the retained trace explains <impact>
    Examples:
      | condition                  | impact                                |
      | cookie-based identity      | rejected clients without cookies      |
      | cookie-based routing       | clients remain on the fallback v1     |
      | instance-local work state  | HTTP 200 hides missing work on v2      |
      | invalid bearer fixture     | invalid identity remains rejected     |
      | delayed responses          | the original deadline is exceeded     |

  Scenario: Missing evidence is not a successful migration
    Given the mobile post-handoff observation is unavailable
    When the operator rehearses an otherwise valid configuration
    Then the result is unknown with one observed client out of two
    And the four unavailable mobile checks remain unknown

  Scenario: Browser-only success cannot certify a cookie-less client
    Given synthetic browser cookies are still present
    When both observed clients meet the identity routing state and budget checks
    Then the cookie-removal check is unknown
    And the result is unknown rather than cookie-less success

  Scenario: A known failure dominates incomplete observations
    Given the mobile observation is unavailable and cookie routing leaves the API client on v1
    When the operator rehearses the trace
    Then the result is failure while the missing mobile checks remain unknown

  Scenario: Guard invalid input and stale actions without changing evidence
    Given an invalid choice or extra configuration field
    When a rehearsal is requested
    Then an explicit error leaves the current result and history unchanged
    Given a rehearsal is already checked
    When another rehearsal is requested before reset
    Then an explicit state error leaves all evidence unchanged

  Scenario: Reset retains failures and does not replenish the bounded run budget
    Given a failed or unknown rehearsal is retained
    When the operator resets using the keyboard
    Then the default cookie-less configuration and an untested current result return
    And earlier configuration traces outcomes and run numbers remain visible
    And after twelve recorded rehearsals no additional result can be recorded

  Scenario: Browser safety and keyboard access
    Given the standalone lesson is opened with the published isolated browser helper
    Then the exact synthetic training banner is prominent
    And Tab arrows Enter and Space operate the labelled controls
    And invalid input focuses an announced error and reset restores focus
    And local external assets load but inline script connections frames and form navigation are denied
