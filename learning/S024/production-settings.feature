Feature: S024 production-configuration validation, one portable A-S024 satisfier
  # README S024: Confirm effective production settings work without accidentally
  # executing production background work.
  # D-S024: Candidate readiness reflects effective target settings and identity/network
  # access; background work cannot accidentally run twice.
  # Frozen S, original kanoUnit A-S024, packet SC-S024, SOURCE gate.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And synthetic production already has one background worker
    And the candidate retains candidate-mi and candidate-subnet, not production's identity or network
    And no Azure, identity, network service, infrastructure or background job is invoked

  Scenario: Staging success is not effective-production readiness
    Given staging has a working staging dependency
    And the candidate has no target identity grant and its target route is blocked
    When I validate only staging with background work suppressed
    Then staging checks pass but the production-readiness result is unknown
    And the comparison names both the production dependency and the retained candidate identity/network

  Scenario: Effective settings expose slot-specific differences
    Given I select effective production validation and a retained staging dependency setting
    And the candidate's target identity grant is denied and its target route is blocked
    When I validate with background work suppressed
    Then the setting, identity-access and network checks fail independently
    And the production-readiness result is failure
    And the production worker remains the sole worker

  Scenario: All required effective settings are observed safely
    Given a fresh run selects the target dependency setting
    And candidate-mi has a target grant and candidate-subnet can reach the target
    When I validate effective production settings with background work suppressed
    Then all four required checks pass
    And readiness is success only for this deterministic synthetic fixture
    And candidate background starts and duplicate background starts are both zero

  Scenario: Background work cannot accidentally run twice
    Given production's background worker is already active
    When I request validation with candidate background work enabled
    Then a safety guard blocks validation before dependency checks or candidate work
    And the result is failure with one prevented duplicate start and zero actual duplicate starts

  Scenario Outline: Missing evidence is unknown, not a successful readiness check
    Given effective production validation has otherwise safe settings
    And the <check> observation is unavailable
    When I validate
    Then that check is unknown and the result is unknown

    Examples:
      | check    |
      | setting  |
      | identity |
      | network  |

  Scenario: Recovery cannot erase a measured failure or missing evidence
    Given I have recorded a failure or unknown validation
    When I repair the controls and a later validation succeeds
    Then both snapshots remain visible
    And the run verdict retains the earlier failure or unknown

  Scenario: Input and state guards are strict and atomic
    When an enum, property, state snapshot or run bound is invalid
    Then the model rejects it without mutation
    And malformed browser controls produce a focused accessible error

  Scenario: Keyboard archive/reset retains bounded history
    Given I have a nonempty run
    When I activate archive/reset by keyboard
    Then the entire run and its verdict remain in page-memory history
    And the fresh run is unknown with default controls and focus on validation scope
    And at most three runs are retained with explicit eviction count
    And at most six validations per run and run IDs 1 through 1000 are supported
    And native form.reset remains callable

  Scenario: The offline page enforces its content security policy
    When an inline script or external connection is attempted in the actual isolated browser
    Then the browser reports script-src and connect-src violations
    And no inline marker is executed and no external request completes
    And normal verification never rewrites retained proof
