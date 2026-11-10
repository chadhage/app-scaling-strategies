@U058 @C043 @test-tooling @offline @zero-credit
Feature: Admit the C043 verification browser through the owning Edge qualification API
  C043 verification must follow current qualification rather than a fixed browser major.
  This repair changes verification tooling only, not the preset service or its page.
  Fixture qualification is not qualification of an installed browser.

  Background:
    Given all C043 production files and original evidence have recorded byte identities
    And the original C043 browser driver is retained with its exact recorded bytes
    And fixture reports are produced by the real qualifyEdge API with injected adapters
    And every adapter supplies synthetic facts without inspecting an installed browser
    And admission membership comes through that API, not a direct qualified.json reader
    And child test processes have NODE_TEST_CONTEXT and NODE_V8_COVERAGE removed
    And fixture sessions and services are caller-owned and closed in finally

  @specification-first @red
  Scenario: The original driver rejects a genuinely fixture-qualified signed major 157
    Given the fixture API admits Microsoft-signed version "157.0.4341.42"
    And its report has ok true, no reason codes, and qualifiedVia "addendum"
    When the retained original browser driver consumes the matching synthetic binary facts
    Then the assertion that qualified browser admission proceeds fails
    And the original assertion reports actual major "157" instead of expected major "156"
    And the failure is not a missing module, syntax error, shell failure, or browser environment error
    And raw stdout, stderr, exit code, and all executed input hashes are archived before any driver edit
    And the assertion source and original driver remain reproducible without a real browser

  @green-replay
  Scenario: The identical RED assertion passes after the tooling repair
    Given the immutable assertion and fixtures used for the original-driver RED
    When the same assertion runs unchanged against the amended browser driver
    Then fixture-qualified signed version "157.0.4341.42" proceeds through admission
    And the replay against the retained original driver still reproduces the assertion RED
    And neither retained input bytes nor raw RED transcripts are rewritten

  @admission
  Scenario Outline: Only current API-qualified Microsoft-signed fixtures proceed
    Given the binary version is "<version>"
    And its signature is Valid with organization exactly Microsoft Corporation
    And the fixture owning API supplies qualified majors "<qualified>"
    When the C043 driver requests qualification before starting its service or browser
    Then the owning API returns "<verdict>" with reason "<reason>"
    And service and browser admission is "<admission>"

    Examples:
      | version       | qualified | verdict | reason              | admission |
      | 156.0.4314.58 | 156       | pass    | none                | allowed   |
      | 157.0.4341.42 | 156,157   | pass    | none                | allowed   |
      | 157.0.4341.42 | 156       | fail    | MAJOR_NOT_QUALIFIED | refused   |
      | 158.0.4400.1  | 156,157   | fail    | MAJOR_NOT_QUALIFIED | refused   |

  @signature
  Scenario Outline: A version in the qualified set does not override a signature failure
    Given fixture major 157 is present in the owning API's qualified set
    And the signature adapter supplies status "<status>" and organization "<organization>"
    When the C043 driver requests qualification
    Then the API reports failure including "<reason>"
    And the driver fails before starting a service or browser
    And the refusal is a failed check rather than a skipped or successful check

    Examples:
      | status       | organization                  | reason                  |
      | NotSigned    | Microsoft Corporation         | SIGNATURE_NOT_VALID     |
      | HashMismatch | Microsoft Corporation         | SIGNATURE_NOT_VALID     |
      | Valid        | Fictional Software            | PUBLISHER_NOT_MICROSOFT |
      | Valid        | Microsoft Corporation Impostor | PUBLISHER_NOT_MICROSOFT |

  @fail-closed
  Scenario: Qualification cannot be inferred from a major alone
    Given a fixture result names a major that appears in its qualifiedMajors
    But qualification returns ok false with a named failed fact
    When the driver evaluates admission
    Then no service or browser starts
    And the qualification failure is retained in the diagnostic result

  @fail-closed
  Scenario: An unavailable or malformed qualification fact never becomes admission
    Given a fixture adapter cannot establish the binary, signature, digest, version, or qualified authority
    When the owning API returns a failure or qualification throws
    Then the driver reports failure without starting a service or browser
    And no fixed-major fallback or historical binary-hash fallback is used

  @live-with-live
  Scenario Outline: The launched browser must match the currently admitted binary version
    Given the owning API admits signed binary version "157.0.4341.42"
    When the isolated fixture helper returns browser version "<browserVersion>"
    Then the browser-version check is "<verdict>"
    And no page observation is counted before a matching version is proved
    And every started caller-owned fixture session and service is closed in finally

    Examples:
      | browserVersion | verdict |
      | 157.0.4341.42   | pass    |
      | 157.0.4341.43   | fail    |
      | 156.0.4314.58   | fail    |
      | 158.0.4400.1    | fail    |
      | malformed      | fail    |

  @diagnostics
  Scenario: Diagnostics record current facts rather than historical equality pins
    Given a fixture-qualified browser matches the admitted binary
    When verification records its browser admission
    Then it records the actual API version, major, signature, path, SHA-256, and qualification authority
    And it records the helper's actual browser version
    And no hard-coded major list or direct qualified.json read exists in the C043 driver
    And the page and preset-observation assertions outside admission remain unchanged

  @current-authority @append-only
  Scenario: An exact test-tooling amendment preserves historical authority
    Given the original captures and their input pins remain byte-exact
    When the necessary driver and evidence-verifier bytes are amended
    Then a numbered append-only amendment names every exact previous and replacement identity
    And the chain is rooted in recorded original authority and links to its previous amendment
    And an independent current head anchor identifies the complete newest amendment bytes
    And the trusted amendment checker is pinned without a circular hash dependency
    And changed original verification bytes are retained with their recorded identities
    And historical manifests resolve historical inputs rather than pretending the old captures ran new code
    And current authority accepts only the exact amended bytes, not arbitrary future replacements
    And a new U058 document describes replay commands and authority limits without rewriting the original README

  @authority-negative
  Scenario Outline: The amendment fails closed for tampering or an unapproved replacement
    Given an otherwise valid fixture amendment chain
    When "<tampering>" is introduced
    Then the authority verification fails by the affected path and rule
    And no historical manifest, RED transcript, or production pin is repinned to make it pass

    Examples:
      | tampering                                         |
      | an unrelated replacement of an amended test        |
      | a changed production file                         |
      | a changed original capture or transcript           |
      | a changed retained original driver                 |
      | a changed amendment checker                        |
      | a missing amendment or current head anchor          |
      | a changed previous link or superseded input hash    |
      | a reordered, duplicated, or unanchored amendment     |
      | any single-byte change to the anchored newest head  |
      | an amendment outside the exact approved path set    |

  @evidence
  Scenario: Original and repair evidence are independently verified
    Given the driver-admission, unchanged RED replay, and amendment negative suites are green
    When the focused C043 surface, replay, claims, and evidence suites run
    Then every original capture manifest and its transcripts still verify
    And every repair capture is verified without omitting an original manifest
    And no published suite silently returns early, skips required checks, or needs private mutable state
    And new public paths and diagnostics use relative paths or placeholders
    And any unavoidable local identifiers remain only in immutable private raw originals

  @scope @not-installed-qualification
  Scenario: This zero-credit repair does not claim production or installed-browser proof
    When the U058 completion evidence is assembled
    Then exact before-and-after hashes prove all enumerated C043 production files unchanged
    And exact before-and-after hashes prove all original captures unchanged
    And the diff identifies only authorized C043 verification tooling, specification, documentation, and amendment additions
    And production coverage is explicitly not-applicable because no production bytes changed
    And browser-production observation is explicitly not-applicable to this tooling-only repair
    And fixture acceptance of major 157 is not described as installed-157 qualification
    And U034 remains responsible for real requalification, append admission, and all actual adopter browser gates
    And only the coordinator may independently accept and publish under existing C043 satisfier authority
    And U058 earns zero additional Kano credit
