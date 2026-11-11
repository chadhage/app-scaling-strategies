Feature: A cancelled lease decision cannot become a new refusal
  The original C011 reservation behavior and retained early evidence remain unchanged.

  Scenario: A non-authentication failure occurs after the client disconnects
    Given a valid reserve or release waits at the commit gate
    And the client disconnects before the gate fails
    When the gate rejects with a non-authentication error
    Then no reservation or allowance changes
    And no refusal audit record or answer is produced for the cancelled request

  Scenario: A live request encounters the same failure
    When a reserve or release fails at the commit gate on a live connection
    Then the answer is the typed INTERNAL_ERROR refusal
    And the connection closes and exactly one refusal is audited

  Scenario: Authentication failures retain their established precedence
    When the commit gate rejects with an authentication error
    Then the authentication refusal is audited even if its connection ended
    And no capacity or spend changes
