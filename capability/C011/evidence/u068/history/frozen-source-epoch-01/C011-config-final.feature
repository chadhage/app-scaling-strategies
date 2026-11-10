Feature: Configuration refusal is typed and contains no caller-provided exception
  Scenario: A configuration getter or proxy refuses to be inspected
    Given a caller-provided configuration throws while its closed snapshot is read
    When configuration is resolved or the reservation app is created
    Then the error is CONFIG_INVALID with no caller-provided exception text
    And no listener, reservation, audit or resource is created
