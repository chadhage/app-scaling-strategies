Feature: Qualify the installed Microsoft Edge (signed, within the qualified major) and fail closed
  Tooling item U018 (zero credit, kind unblock, entry gate U003 Done); it unblocks every browser-pin K card
  Local, synthetic, offline: Node built-ins and Windows PowerShell only, no network, no packages, no browser launch except --requalify

  Scenario: A genuine Microsoft-signed Edge inside the qualified majors passes and its actual identity is recorded
    Given an installed msedge.exe with a Valid Authenticode signature whose subject organization is Microsoft Corporation
    And its file version resource is 156.0.4314.58 and the data file qualified.json lists the major 156
    When qualifyEdge() runs
    Then ok is true and reasons is empty
    And the report records the path, the version 156.0.4314.58, the major 156, the signature status and publisher and the SHA-256 of the binary
    And no historical build number or hash is compared, so 156.0.4314.50 and 156.0.4314.58 both qualify

  Scenario: A missing binary fails closed
    Given none of the candidate locations that isolated.cjs and Playwright consult holds a msedge.exe
    When qualifyEdge() runs
    Then ok is false with the reason EDGE_NOT_FOUND and the checked candidates are listed
    And a candidate that is a directory fails as EDGE_NOT_A_FILE

  Scenario Outline: Anything but a valid Microsoft signature fails closed
    Given a binary whose signature query reports status "<status>" and subject "<subject>"
    When qualifyEdge() runs
    Then ok is false and the reason is "<reason>"

    Examples:
      | status       | subject                                                         | reason                |
      | NotSigned    |                                                                 | SIGNATURE_NOT_VALID   |
      | HashMismatch | CN=Microsoft Corporation, O=Microsoft Corporation, C=US         | SIGNATURE_NOT_VALID   |
      | NotTrusted   | CN=Microsoft Corporation, O=Microsoft Corporation, C=US         | SIGNATURE_NOT_VALID   |
      | Valid        | CN=Contoso Ltd, O=Contoso Ltd, C=US                             | PUBLISHER_NOT_MICROSOFT |
      | Valid        | CN=Not Microsoft Corp, O=Not Microsoft Corp, C=US               | PUBLISHER_NOT_MICROSOFT |
      | Valid        | CN=Microsoft Corporation, O=Evil Inc, C=US                      | PUBLISHER_NOT_MICROSOFT |
      | Valid        | O="Evil, O=Microsoft Corporation", C=US                         | PUBLISHER_NOT_MICROSOFT |
      | Valid        | O=Microsoft Corporation, O=Evil Inc                             | PUBLISHER_NOT_MICROSOFT |

  Scenario: The publisher is parsed, never matched as a substring
    Given a distinguished name with escaped separators, quoted values, hex escapes, a multi-valued component and an OID type
    When the subject is parsed
    Then the organization is the exact O attribute value, a missing or repeated O is an error, and a malformed name is an error

  Scenario Outline: Only a major listed in qualified.json qualifies, with no newer-is-fine rule and no wildcard
    Given a Microsoft-signed binary whose version is "<version>"
    When qualifyEdge() runs
    Then ok is <ok> and the reason is "<reason>"

    Examples:
      | version          | ok    | reason                |
      | 156.0.4314.58    | true  |                       |
      | 155.0.4300.1     | false | MAJOR_NOT_QUALIFIED   |
      | 157.0.4400.2     | false | MAJOR_NOT_QUALIFIED   |
      | 1560.0.0.0       | false | MAJOR_NOT_QUALIFIED   |

  Scenario: qualified.json is validated and a broken list fails closed
    Given a qualified list that is missing, not JSON, empty, a wildcard, a string, a fraction, a duplicate or negative
    When qualifyEdge() runs
    Then ok is false with the reason QUALIFIED_MAJORS_INVALID

  Scenario Outline: An unreadable or unparsable version fails closed
    Given a Microsoft-signed binary whose file version resource reads "<version>"
    When qualifyEdge() runs
    Then ok is false and the reason is VERSION_UNPARSABLE, or VERSION_UNAVAILABLE when there is no value

    Examples:
      | version                       |
      | 156.0.4314                    |
      | 156.0.4314.58.1               |
      | 156.0.4314.58 (Official build) |
      | v156.0.4314.58                |
      | 156.0.04314.58                |
      | 156.0.4314.70000              |
      | 156,0,4314,58                 |

  Scenario: A PowerShell that hangs past the timeout fails closed and is ended
    Given the signature query never answers within the timeout
    When qualifyEdge() runs
    Then ok is false with the reason SIGNATURE_TIMEOUT and the run returns instead of hanging
    And the real PowerShell adapter ends the child that it started when its own timeout expires

  Scenario: A binary that changes while it is checked fails closed
    Given the file size or modification time differs between the first look and the last look
    When qualifyEdge() runs
    Then ok is false with the reason EDGE_CHANGED_DURING_CHECK

  Scenario: A real equality pin on 156.0.4314.50 fails on the installed 156.0.4314.58 while qualifyEdge passes
    Given the installed Edge is 156.0.4314.58 and the old suites assert equality with 156.0.4314.50
    Then that equality assertion throws on the installed version
    And qualifyEdge() reports ok true with the actual version 156.0.4314.58

  Scenario: The path reaches PowerShell without shell interpolation
    Given a path with spaces, quotes, ampersands, semicolons, dollar signs and backticks
    When the real adapter asks PowerShell about it
    Then the path travels in the environment variable QUALIFY_TARGET and never in the command line
    And the command is passed as an encoded script, so no part of the path can become code

  Scenario: Discovery follows the candidate order of Playwright for the msedge channel
    Given LOCALAPPDATA, PROGRAMFILES, PROGRAMFILES(X86) and HOMEDRIVE
    When the candidates are listed
    Then they are the five roots in Playwright order, absolute, de-duplicated and without the relative undefined drive quirk
    And the first existing candidate is the one that is qualified

  Scenario: The command line tool reports through exit codes and a JSON report
    When node testing\browser\qualify\qualify.cjs runs
    Then the exit code is 0 for a pass, 1 when it fails closed and 2 for a usage error
    And stdout carries the JSON report, stderr one verdict line, and --json <out> writes the same report without overwriting an existing file

  Scenario: --requalify runs the isolated helper suites under a hard timeout and records the counts
    Given a signed Edge whose major may be new
    When the isolated.test.cjs and loopback.test.cjs suites run one by one with node --test --test-concurrency=1 from testing\browser
    Then the report records per suite and in total the tests, pass, fail, cancelled and skipped counts, the exit code and the duration
    And the Edge version and SHA-256 are recorded before and after, and a change during the run fails closed
    And a suite that exceeds the timeout is ended with its process tree and fails, and no run is started on an unsigned or foreign-signed binary
    And the nested node --test child never inherits NODE_TEST_CONTEXT or NODE_V8_COVERAGE

  Scenario: The documented limits stay visible
    Given the README
    Then it states what a signature check does not prove and that qualified.json grows only through a requalification card
    And it carries the five line adoption recipe for the browser-pin K cards and the exact commands for RED, GREEN, per-file coverage and the machine test
