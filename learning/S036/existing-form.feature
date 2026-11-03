Feature: A-S036 old-page anti-forgery submission after cutover
  # S036 / D-S036 / SC-S036; one frozen S unit, synthetic-only.
  Background:
    Given v1 rendered one old form with a synthetic request-token and cookie pair
    And no real identity, secret, token, server, Azure resource or authentication exists
    And v2 always requires key, application, request-integrity and cookie-binding checks

  Scenario: Compatible validation accepts a valid prior form
    Given v2 retains the old synthetic key and application boundary
    When the operator loads the old form, cuts over and submits the valid pair
    Then the observed synthetic submission is accepted exactly once
    And valid-prior continuity succeeds with one synthetic effect

  Scenario Outline: Invalid submissions remain rejected without weakening validation
    Given compatible v2 validation
    When the operator submits an old form with <condition> after cutover
    Then the observed synthetic submission is rejected with zero effects
    And the safety assertion succeeds but valid-prior continuity is not tested
    Examples:
      | condition       |
      | forged token    |
      | missing cookie  |
      | foreign pairing |

  Scenario Outline: Incompatible configuration interrupts valid prior submissions
    Given v2 has <configuration>
    When a valid prior form is submitted after cutover
    Then the observed submission is rejected and continuity fails
    And the failed check is named and no synthetic effect occurs
    Examples:
      | configuration             |
      | old key retired too early |
      | changed application       |

  Scenario: Missing observations cannot demonstrate acceptance or rejection
    When submission observation is missing after cutover
    Then the result and all validation checks remain unknown
    And accepted, rejected and effect measurements are not invented

  Scenario: State transitions and inputs cannot bypass the exercise
    Then submission before cutover, repeated submission and unknown input fields reject
    And malformed, forged or over-bound state rejects without mutation
    And six completed immutable histories are the maximum

  Scenario: Keyboard reset retains honest history
    Given earlier failure, success and unknown results
    When the operator uses the keyboard to reset the current rehearsal
    Then defaults and initial focus return without erasing completed histories
    And a reset before submission discards only unsubmitted setup
    And reload clears this explicitly memory-only exercise

  Scenario: Browser-only isolation is enforced
    Then the exact synthetic training banner is prominent
    And external connections, inline scripts, inline handlers and form navigation are blocked by CSP
    And no real authentication, native Azure or production runtime proof is claimed
