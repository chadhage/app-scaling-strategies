Feature: A-S103 synthetic certificate and hostname continuity
  The SC-S103 portable lesson uses fixed teaching data only.
  No certificate, private key, trust store, TLS setting, DNS record, or endpoint is configured.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And old and candidate are eligible in the selected fixed inventory
    And parked is ineligible and cannot contribute a successful client observation
    And browser and service are the two required synthetic client trust profiles
    And only old is initially admitted

  Scenario: Measure and admit a compatible combination
    When I select the supported inventory and the certificate covering both required hostnames
    And I rehearse checks for app.example.test
    Then all four eligible destination and client observations pass
    When I request candidate admission
    Then old and candidate are admitted for that measured combination

  Scenario Outline: Reject an invalid eligible candidate
    When I select <condition> for an eligible candidate
    And I rehearse checks
    Then the candidate has a measured <outcome> outcome
    When I request candidate admission
    Then admission is blocked and old remains admitted
    And unsuccessful client observations do not count as successful continuity

    Examples:
      | condition                  | outcome |
      | wrong hostname certificate | fail    |
      | untrusted certificate      | fail    |
      | expired certificate        | fail    |
      | incompatible TLS inventory | fail    |
      | unknown client trust       | unknown |
      | unobserved TLS inventory   | unknown |

  Scenario: Unknown or absent evidence is not success
    When I request admission without a rehearsal
    Then admission is blocked as unmeasured
    And no successful client observation is fabricated

  Scenario: Retain history without reusing an old approval
    Given I have admitted a compatible measured combination
    When I rehearse a different incompatible combination
    Then candidate approval is cleared and old remains admitted
    And the previous measurements and admission decision remain in bounded history

  Scenario: Reject malformed commands and fabricated state
    When selectors, commands, or state have invalid types, extra fields, or fabricated results
    Then the model rejects the input without mutating retained state

  Scenario: Keyboard, errors, reset, and isolation
    When I operate the selectors and buttons using the keyboard
    Then measurements, gate decisions, and history are visible in the actual DOM
    When a selector is invalid or the bounded history is full
    Then an accessible error is shown without losing the last valid state
    When I reset the lesson
    Then the initial selectors, old-only admission, and keyboard focus return
    And earlier measurements, decisions, and the six-attempt allowance remain retained
    And browser script failure is visible rather than a synthetic pass
    And CSP blocks inline script and network connections
