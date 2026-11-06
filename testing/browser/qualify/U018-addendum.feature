Feature: U018 addendum, behavior that the implementation added to the first specification (U018.feature stays as archived with the RED)
  Local, synthetic, offline; the machine scenarios run only in tests\qualify.machine.test.cjs, outside the coverage run

  Scenario: A binary that is not qualified is never launched by --requalify
    Given the qualification reports SIGNATURE_NOT_VALID, PUBLISHER_NOT_MICROSOFT, EDGE_NOT_FOUND or any code except MAJOR_NOT_QUALIFIED
    When --requalify runs
    Then no heavy slot is taken, no suite is started and the report says requalification.ran is false with the codes
    And a signed Edge whose only failure is MAJOR_NOT_QUALIFIED still gets its suites run, because that is what a new major needs

  Scenario: The suites must have run the Edge that was qualified
    Given a suite prints "Real Chromium <version>" for the browser Playwright launched
    When that version differs from the file version of the qualified msedge.exe
    Then the requalification fails closed with BROWSER_VERSION_MISMATCH and the versions seen are recorded in the report

  Scenario: The heavy-slot hook uses PowerShell 7
    Given Windows PowerShell 5.1 refuses local unsigned scripts under its default execution policy
    When --slot-script and --slot-owner are given with --requalify
    Then the slot script runs under pwsh with -Action Acquire and -Action Release and the slot is released after the suites

  Scenario: The inherited PowerShell 7 module path cannot break or redirect the signature query
    Given the parent environment carries a PSModulePath of PowerShell 7
    When the real adapter starts Windows PowerShell
    Then PSModulePath is not passed on, so Microsoft.PowerShell.Security loads from the Windows PowerShell installation

  Scenario: The real machine behaves as the fixtures say
    Given the installed Edge, a text file named msedge.exe and the node.exe of this machine
    When the machine test asks the real PowerShell
    Then Edge is Valid by Microsoft Corporation inside the qualified majors, the text file fails as SIGNATURE_NOT_VALID
    And node.exe, which is validly signed by another publisher, fails as PUBLISHER_NOT_MICROSOFT
    And the candidate that is qualified is the very binary that Playwright launches for the msedge channel
