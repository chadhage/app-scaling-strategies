Feature: Accepted lesson bytes survive an LF source checkout without accepting edits
  Scenario: Both recorded forms are accepted independently
    Given the eight immutable accepted lesson assets
    And their recorded raw and CRLF-to-LF SHA-256 values
    When the raw pin matches, regardless of the canonical pin
    Or the CRLF-to-LF canonical pin matches, regardless of the raw pin
    Then verifyAsset returns the original Buffer unchanged
    And a changed byte in either form is refused with its asset path

  Scenario: Real producer and current consumer services use LF lesson sources
    Given a git archive of the accepted producer and current accepted C059
    And foreign first-party text sources converted to LF, excluding historical evidence
    When the actual C041 and C059 service-starting suites run
    Then their real loopback listeners serve the exact LF asset bytes
    And historical import pins, raw evidence and source freezes are not silently replaced

  Scenario: Sealed predecessor authority is append-only
    Given the accepted C041 source-hashes and original source witnesses
    Then only exact replacements named by a chained addendum are accepted
    And every other source or evidence edit, missing addendum or changed addendum is refused
    And each changed production file independently meets 85/85/85 while actually loaded
