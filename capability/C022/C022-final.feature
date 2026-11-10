Feature: Nonvacuous synthetic refusal evidence
  Scenario: Every generated refusal test actually checks its claim
    Given the retained refusal test returns before asserting the CONNECT row
    When the unchanged assertion-counting audit executes that test
    Then the audit fails with an assertion identifying the zero-assertion test
    And the corrected test executes positive assertions without changing production

  Scenario Outline: CONNECT after successful requests is answered and closed
    Given an authenticated synthetic session on loopback
    When successful GET requests precede CONNECT in <shape>
    Then every GET receives 200 before exactly one 405
    And the 405 is METHOD_NOT_ALLOWED with Connection close
    And the server ends the connection without changing tenant state
    Examples:
      | shape                          |
      | one write containing GET CONNECT |
      | two writes separated by 150 ms |
      | one write containing GET GET CONNECT |

  Scenario: A stalled first request is answered, not silently cut
    When incomplete headers reach the configured request timeout
    Then exactly one typed REQUEST_TIMEOUT response has status 408
    And the server ends the connection

  Scenario: Each equivalent has a runnable differential witness
    Given identical deterministic synthetic inputs for real and mutant trees
    Then complete response, world and audit outcomes agree for the route capture mutant
    And owned socket outcomes agree after close for the redundant close mutant
    And ticket variants and suffixes agree for the ticket end-anchor mutant
