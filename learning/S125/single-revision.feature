Feature: A single-revision update is not readiness, traffic or continuity evidence
  Every container app, revision, image, replica, probe, route, lifecycle,
  session and effect in this lesson is fixed fictional teaching DATA ONLY.
  No scenario calls Azure, a registry or a management/configuration endpoint.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And old revision lesson-api--r1 serves 100 percent of fictional ingress
    And the fictional per-revision replica target remains 2

  Scenario: Record a nominal software update without claiming replacement
    When the operator records the fixed candidate v2 with the ready fixture
    Then a separate immutable candidate lesson-api--r2 is recorded
    And the old revision remains active at 100 percent
    And readiness and traffic transition remain unobserved
    And the action is software revision replacement, not compute-capacity scaling

  Scenario Outline: Readiness requires provisioning, replica count and every probe
    Given the operator has recorded candidate v2 with fixture <fixture>
    When the operator inspects readiness DATA
    Then the measured readiness result is <result>
    And the old revision remains active at 100 percent until readiness permits replacement
    And a nominal update or a shallow successful probe cannot prove traffic transition

    Examples:
      | fixture           | result   |
      | ready             | positive |
      | provision-failed  | negative |
      | replicas-short    | negative |
      | startup-failed    | negative |
      | probe-failed      | negative |
      | readiness-unknown | unknown  |

  Scenario Outline: Readiness permits but does not itself observe a routing switch
    Given positively observed readiness with fixture <fixture>
    When the operator inspects traffic transition DATA
    Then the traffic result is <result>
    And current unknown traffic is not replaced by the last known 100 percent old route
    And a mismatching or unknown route cannot authorize continuity success

    Examples:
      | fixture         | result   |
      | ready           | positive |
      | traffic-mismatch| negative |
      | traffic-unknown | unknown  |

  Scenario Outline: Verify sessions and old work independently after observed replacement
    Given positively observed readiness and traffic with fixture <fixture>
    When the operator inspects sessions and old work DATA
    Then two attempted synthetic user journeys remain in the measured denominator
    And session/state result is <sessions>
    And old-work/effect result is <work>
    And the overall result is <overall>
    And failure or missing evidence never becomes completed synthetic continuity

    Examples:
      | fixture          | sessions | work     | overall  |
      | ready            | positive | positive | positive |
      | session-lost     | negative | positive | negative |
      | work-interrupted | positive | negative | negative |
      | work-unknown     | positive | unknown  | unknown  |
      | journey-unknown  | unknown  | positive | unknown  |
      | latency-breach   | negative | positive | negative |

  Scenario: Typed commands, state and sequence are guarded without coercion
    When an input is not exactly the text v2 or names an unknown fixture
    Or a command has wrong types or unexpected fields
    Or state, observations, counters or retained history are forged
    Then the operation reports an explicit error without changing state or history
    And a premature or repeated well-typed action records a negative safe hold

  Scenario: Bounded history and keyboard reset do not hide previous failures
    Given the operator has made 12 validly typed actions
    When another action is attempted
    Then all 12 history entries remain and reset is required
    When the operator activates reset with the keyboard
    Then only this page's in-memory lesson returns to baseline
    And focus returns to the fixture selector
    And a control named reset cannot shadow the form reset implementation

  Scenario: Observe actual browser safety and failure behavior
    Given the standalone page loads through the published isolated browser helper
    Then labels, visible focus, Enter submission, alert and status are observable
    And missing model assets fail visibly without claiming an update
    And actual CSP rejects inline scripts, inline events, eval, connections and form navigation
    And reset works after recovery
    And the session is closed with an awaited finally
    And normal verification does not rewrite source or evidence
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures new raw observations

  Scenario: IaC and source-parent acceptance are outside this resource-free unit
    Then IaC is N/A, not a fabricated deployment test
    And native B-S125, original D-S125 and production Node.js 24 remain unverified
    And one original frozen S unit may be accepted only by the parent
