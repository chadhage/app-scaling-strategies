Feature: Internal warm-up is not external production-path proof
  A-S104 / D-S104 / SC-S104 is one frozen S teaching unit.
  Host, redirect, callback, authentication and routing outcomes are fixed DATA ONLY.
  Training rehearsal - synthetic data - not a live Azure result

  Background:
    Given a browser-openable resource-free lesson with no network or identity operations
    And a fixed internal warm-up success of HTTP 200 in 32 synthetic milliseconds
    And at most 12 recorded comparisons in this in-memory page session
    And an external journey budget of 250 synthetic milliseconds

  Scenario: Internal success cannot approve the external path
    When the operator records only internal warm-up
    Then internal health is successful
    But the external assessment is unknown and not eligible
    And the trace explains that external host, redirects and callbacks were not observed

  Scenario: Approved redirects preserve state and reach the expected route
    When the operator compares the approved external fixture
    Then the production host label matches
    And one approved redirect does not loop
    And the callback retains lesson-state-A
    And synthetic authentication succeeds and routing reaches candidate-label
    And every external check succeeds within the declared synthetic budget
    And eligibility applies only to this synthetic fixture, not to a real host or source parent

  Scenario Outline: Internal success does not hide external failures
    When the operator compares "<fixture>"
    Then the internal warm-up remains successful
    But the external "<check>" fails
    And the assessment is failure and not eligible
    And the failed result remains counted after a later positive comparison and reset

    Examples:
      | fixture              | check          |
      | host-mismatch        | host           |
      | redirect-loop        | redirect       |
      | callback-state-lost  | callback       |
      | authentication-fails | authentication |
      | routing-mismatch     | routing        |

  Scenario Outline: Missing observations are not success
    When the operator compares "<fixture>"
    Then the external assessment is unknown and not eligible
    And unknown durations remain null, never zero or a successful measurement

    Examples:
      | fixture             |
      | external-unobserved |
      | callback-unobserved |

  Scenario: Strict input and state validation is fail closed
    When a selection, record, counter, array or eligibility value is malformed or forged
    Then an explicit typed error is reported without appending a record
    And the prior history remains unchanged
    And comparison 13 is rejected until a new page session, not bypassed by reset

  Scenario: Keyboard, error and reset behavior is observable in an actual browser
    When the operator uses Tab, arrow keys and Enter to select and submit
    Then the measured trace and retained history are visible
    When an unsupported DOM selection is submitted
    Then the alert is focused and no record is added
    When the operator activates Reset by keyboard
    Then defaults and current output reset and focus returns to the fixture
    But history, failures and the session allowance remain retained

  Scenario: Browser CSP denies execution without external traffic
    Given local external scripts and styles under restrictive CSP
    When an inline script or dynamic evaluation is attempted as a deliberate test
    Then the actual browser denies it and emits a CSP observation
    And no external navigation, request, callback or configuration change occurs
    And the isolated browser is always closed in an awaited finally block

  Scenario: Producer evidence does not turn normal verification into a writer
    Given byte-preserved source and RED snapshots outside automatic test discovery
    When normal focused or browser verification runs
    Then no tracked evidence is written
    And only deliberate CAPTURE_BROWSER_EVIDENCE=1 captures browser observations
    And canonical Git-source qualification is distinct from raw CRLF evidence
