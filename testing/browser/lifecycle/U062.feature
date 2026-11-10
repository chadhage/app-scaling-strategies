Feature: Independently own the actual look-alike browser, not a compatibility launcher
  The fixture is test tooling only.
  The six accepted lifecycle implementation files, sealed browser helpers,
  original imports, and every historical capture remain unchanged.

  Scenario: A direct launch remains a positive control
    Given an independent sealed fixture owns a new browser connection
    And its authenticated browser protocol names the direct browser process
    When the fixture records the native creation identity of that process
    Then the live browser is observed independently of the bounded-startup subject
    And exact close settles the connection and every owned identity
    And a pre-existing same-image neighbor is untouched

  Scenario: Compatibility launcher exit is not browser death
    Given the caller-owned compatibility launcher has exited
    And the independent fixture browser still owns its authenticated connection
    When the protocol names the actual surviving browser root
    Then the fixture observes that actual root and its native creation identity
    And unrelated expiry or close never targets that identity
    And the fixture finally closes its own exact session and tree

  Scenario: A reused PID or a pre-existing same-image process is never adopted
    Given the recorded browser PID now names another native creation identity
    When the fixture checks liveness or performs cleanup
    Then it refuses to treat the replacement as its browser
    And no kill targets the replacement or a same-image neighbor
    And an authenticated-root claim that predates the new fixture launch is refused

  Scenario: Cleanup and handles finish naturally
    Given each real U005 and U006 file contains its original three cases and caps
    When the changed fixture is verified with deterministic retained-subject RED then unchanged GREEN
    And the complete files run on actual Microsoft-signed qualified Edge
    Then all six cases pass without skips or weakened noninterference assertions
    And the TAP summaries and Node processes exit naturally without signals or guard timeouts
    And exact owned process, session, profile, and protocol handles are confirmed closed
    And unknown shared-runtime neighbors are never adopted or deleted
