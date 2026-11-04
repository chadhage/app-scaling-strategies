Feature: A-S123 immutable custom-container preparation rehearsal
  This is one original S unit in source packet SC-S123.
  Training rehearsal - synthetic data - not a live Azure result
  All container, image, digest, registry, startup, readiness, platform,
  promotion and journey observations are fixed fictional teaching DATA.
  No image build/pull, registry operation, resource/configuration change,
  native swap, cloud deployment, identity, IaC or expenditure is performed.

  Scenario: An immutable image is prepared before initialization and controlled promotion
    Given the prepared fixture and the manual promotion path
    When the operator prepares the fictional digest-pinned candidate
    Then the candidate is prepared but not ready and production remains teaching-v1
    When the operator inspects initialization
    Then the fictional pull, listening port, initialization, dependency, readiness and overlap gates pass
    When the operator rehearses a controlled promotion and observes journeys
    Then the fictional candidate is teaching-v2 and two of two attempted migrations pass
    And former-production recycling is explicitly a modeled native effect
    And a tiny synthetic sample makes no five-nines or native-platform claim

  Scenario Outline: An image or initialization assumption must not become readiness
    Given the <fixture> fixed observation fixture
    When the operator prepares and inspects initialization where preparation allows it
    Then the <classification> result prevents promotion before exposure
    And production remains teaching-v1 with zero attempted migrations, not 100 percent success
    Examples:
      | fixture           | classification |
      | mutable-tag       | negative       |
      | pull-failed       | negative       |
      | wrong-port        | negative       |
      | startup-failed    | negative       |
      | startup-unknown   | unknown        |
      | shallow-green     | negative       |
      | no-headroom       | negative       |

  Scenario: Unsupported native auto-swap is rejected rather than offered as a working option
    Given a prepared and initialized fictional custom container
    When the operator demonstrates native auto-swap rejection
    Then the result is unsupported, no promotion occurs and history records the rejection
    And a separately gated manual or controlled pipeline rehearsal remains possible
    And extra slots never increase the fictional shared plan's compute capacity

  Scenario Outline: Readiness and a routing switch do not prove complete user migration
    Given the <fixture> fixed observation fixture with all preparation gates passing
    When the operator rehearses controlled promotion and observes the two started journeys
    Then one journey is positive and the other is <classification>
    And both attempts remain in the denominator and the result is <classification>
    And the full identity, session, state, effects, destination and original latency budget are checked
    Examples:
      | fixture             | classification |
      | journey-interrupted | negative       |
      | journey-unknown     | unknown        |

  Scenario: Malformed inputs and forged or out-of-order states cannot advance the exercise
    Given a bounded in-memory rehearsal
    When a command has an unknown action, extra field, wrong type or invalid state
    Then an actionable error is shown without mutation or coercion
    And replay validation checks the complete state and retained history
    And twenty accepted actions is the strict history bound

  Scenario: The standalone lesson is keyboard operable, resettable and resource-free
    Given the exact training banner and a restrictive Content Security Policy
    When the operator uses keyboard preparation, inspection, promotion and observation
    Then the actual DOM displays the measured synthetic results and retained history
    When the operator resets after success, failure, unknown or error
    Then defaults, empty history, zero attempts and focus on the fixture selector return
    And reset does not shadow the form reset method
    And inline scripts, inline handlers, eval and connections are denied by the actual browser

  Scenario: Verification does not silently recapture evidence
    Given the published isolated browser helper at its declared SHA256
    When focused verification runs without exact CAPTURE_BROWSER_EVIDENCE=1
    Then all owned file bytes remain unchanged and browser close is awaited in finally
    And deliberate evidence capture is separate from normal read-only verification
