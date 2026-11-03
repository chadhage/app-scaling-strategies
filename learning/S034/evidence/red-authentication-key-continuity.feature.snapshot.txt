Feature: S034 authentication-key continuity during planned rotation
  Training rehearsal - synthetic data - not a live Azure result
  Source: README.md S034; backlog D-S034; portable card A-S034, packet SC-S034.

  Background:
    Given only public fixture key labels, never real keys or credentials
    And v1 issues an old-label cookie or token and v2 issues a next-label fixture
    And there are 1 to 8 synthetic profiles and two validation journeys per profile

  Scenario Outline: Compatible overlap preserves validation across v1 and v2
    Given the credential kind is "<kind>" and both versions accept old and next labels
    When the operator rehearses the rotation with complete observations
    Then every old fixture validates on v2 and every next fixture validates on v1
    And migration is "success" with no failed or unknown journeys
    And tampered fixtures are rejected on both versions

    Examples:
      | kind   |
      | cookie |
      | token  |

  Scenario: Dropping the other version's key interrupts valid sessions
    Given v1 accepts only old and v2 accepts only next
    When the operator rehearses the rotation
    Then all cross-version valid fixtures are rejected
    And the expected-negative verifier passes but migration remains "failure"
    And no validation bypass is offered

  Scenario: Missing evidence is not migration success
    Given compatible overlap and one missing cross-version observation
    When the operator rehearses the rotation
    Then migration is "unknown"
    And the missing attempt stays in the denominator

  Scenario: Unknown evidence cannot hide an observed authentication failure
    Given incompatible keys and one missing observation
    When the operator rehearses the rotation
    Then the other observed rejection makes migration "failure"
    And the unknown count is retained

  Scenario: Invalid inputs and exhausted history do not mutate state
    Given an invalid credential, mode, observation, profile count, or extra field
    When a run is requested
    Then it is rejected without adding or renumbering history
    And eight recorded runs is a terminal run limit even after reset

  Scenario: Keyboard operation and reset retain negative evidence
    Given a failed run and an unknown run have been recorded
    When the operator resets with the keyboard
    Then defaults and focus return to the credential control
    And the current result is cleared without erasing or relabeling history

  Scenario: The browser remains a bounded local rehearsal
    Given the lesson is opened as a local file
    Then external connections, inline scripts, and embedded objects are blocked by CSP
    And no cookie, token, identity registration, cryptographic key, or Azure call is created
