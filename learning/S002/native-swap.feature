Feature: A-S002 rehearses a prepared native slot swap without native-platform proof
  # Kano S; kanoUnit A-S002; parent D-S002; source S002; packet SC-S002.
  Background:
    Given the mode is "Training rehearsal - synthetic data - not a live Azure result"
    And staging contains synthetic v2 while production contains synthetic v1
    And the declared fixture has overlap headroom and compatible shared state
    And no Azure resource, credential, network call, or custom drain controller exists

  Scenario: Warm staging with effective production settings before targeting production
    Given the Windows code manual-swap fixture
    And production is the swap target
    And staging uses the effective production slot-specific settings during warm-up
    And both staging instances pass meaningful dependency and journey readiness at "/readyz"
    And the only accepted warm-up status is explicitly "200"
    When I run the synthetic swap
    Then the trace applies target settings and restarts staging before warm-up
    And all staging readiness checks pass before the routing switch to v2
    And production is the target and the retained staging slot contains former production v1
    And former production workers are marked recycled, not protected by retaining the slot
    And the verifier passes only the educational assertions
    And real Azure readiness and uninterrupted user migration remain unverified

  Scenario Outline: An unsafe selection cannot expose the candidate
    Given an otherwise ready Windows code manual-swap fixture
    And <unsafe selection>
    When I run the synthetic swap
    Then the exercise is blocked with an explicit reason
    And production admissions remain v1
    And the trace contains no routing switch or claimed worker observation

    Examples:
      | unsafe selection                                  |
      | staging is incorrectly selected as the target      |
      | staging was warmed with source-only settings       |
      | the target dependency/session contract is incompatible |
      | one or more staging instances are unready           |
      | the warm-up status policy accepts any HTTP response |
      | a misleading HTTP 500 response is not readiness     |
      | Linux code auto-swap is selected                    |
      | Web App for Containers auto-swap is selected        |
      | an unrecognized configuration value is supplied     |

  Scenario: Opaque former-worker outcomes are not successful continuity evidence
    Given the safe target-effective configuration
    And the selected former-work fixture is "opaque"
    When I run the synthetic swap
    Then the trace records former production worker recycling
    And the in-flight request, long-lived connection, and background job outcomes are "unknown"
    And no claim says the old slot drained or work completed
    And the user-impact result says uninterrupted migration is unverified

  Scenario: A negative teaching success preserves interrupted user work
    Given the safe target-effective configuration
    And the selected former-work fixture is "interrupted"
    When I run the synthetic swap
    Then the verifier passes because it detects the modeled recycling risk
    And the in-flight request, long-lived connection, and background job are "interrupted"
    And retry/reconnect time remains inside the original journey budget
    And no durable continuation, exactly-once effect, or custom drain is claimed
    And educational success is not uninterrupted user migration

  Scenario: Deterministic evidence remains synthetic and local
    Given an unchanged selection and an independent expected-outcome checklist
    When I run the synthetic swap twice and check the outcomes
    Then both structured traces and fixed logical timestamps are identical
    And the independent verifier rejects a missing gate, lost interruption, or a continuity claim
    And actual request limits, maximum job duration, and real native timing remain unmeasured
    And no step adds compute or calls Azure

  Scenario Outline: Corrupted readiness evidence cannot pass as a complete pool
    Given a structured synthetic result with two named staging instances
    And <corruption> is introduced into its readiness evidence
    When the independent verifier checks the result
    Then it returns an educational failure without throwing
    And two records for one worker never establish readiness of both workers

    Examples:
      | corruption                                 |
      | the second record duplicates staging-1     |
      | a record has an unknown or missing identity |
      | a record is null or not an instance object |
      | the instance list contains an empty entry |
      | a readiness field has an invalid type     |

  Scenario: Invalid input remains an explainable negative teaching result
    Given a non-object input or an unexpected input field
    When the model rejects it before target preparation
    Then production admissions remain v1 with no worker observation
    And only redacted input-shape flags accompany the normalized selection
    And the independent verifier can confirm that invalid-input rejection
    And a fabricated invalid-selection reason with valid input cannot pass

  Scenario: Changing conditions invalidates a previous educational check
    Given a checked synthetic result
    When I change a condition
    Then the old result is visibly stale
    And the checklist is cleared and disabled until I run again

  Scenario: Keyboard operation and reset have bounded local cleanup
    Given the file-browser lesson has visible labels, headings, limits, and a live status
    When I select conditions and activate the run and verifier buttons with the keyboard
    Then the resulting DOM distinguishes verifier, user impact, and cleanup
    When I reset the exercise
    Then only local selections, trace, checklist, and result state are cleared
    And verification is disabled and keyboard focus returns to the profile control
    And reset works after safe, blocked, invalid, and interrupted selections
    And no cloud cleanup is needed because no resources were created
