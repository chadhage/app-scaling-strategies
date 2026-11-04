Feature: S124 shared-plan slots versus separate-plan externally routed blue-green
  # A-S124 / D-S124 / SC-S124 / frozen original Kano S unit.
  # Every plan, slot, compute, cost, endpoint and lifecycle observation is fictional DATA ONLY.
  # No actual App Service resource, configuration, identity, infrastructure or deployment exists.

  Background:
    Given the banner is exactly "Training rehearsal - synthetic data - not a live Azure result"
    And the shared fixture has one fictional two-worker plan with 24 compute units
    And the separate fixture has two fictional two-worker plans with 48 total compute units
    And fictional cost units are 2 versus 4, not prices or a complete cost estimate
    And shared dependencies and wider fault-domain independence remain unqualified
    And all commands and state are strictly typed, closed and bounded to 24 actions

  Scenario: Extra slots or content do not add compute
    When I compare either fixed plan-placement fixture
    And add the fixed extra slot or content within an existing plan
    Then placement count increases but worker count, compute and fictional plan cost do not
    And shared slots still contend for the same plan capacity
    And separate plans isolate their compute pools, not automatically their dependencies or fault domains

  Scenario: Overlap demand distinguishes compute isolation
    Given blue demand is 18 and candidate warm-up demand is 10 fictional units
    When I inspect the shared-plan warm-up
    Then 28 exceeds its 24-unit shared budget and exposure is safely blocked
    When I reset and inspect the separate-plan warm-up
    Then each demand fits its own 24-unit pool
    And this is a synthetic capacity comparison, not native capacity evidence

  Scenario: HTTP 200 alone is not readiness
    Given the fixed warm-up-only fixture returns 200 without completed initialization
    When I warm either candidate
    Then readiness is negative and ordinary admissions remain blue
    And no user transition is claimed

  Scenario: Native swap retention cannot prevent worker recycling
    Given two existing blue journeys are still in flight in the shared-slot fixture
    When I warm and request the fixed 100 percent new-admission transition
    Then two green receipts pass and two old journeys are interrupted by fictional native recycling
    And retaining slot content is not application-controlled draining
    And interrupted journeys stay in the history

  Scenario: Separate plans permit an explicit external-routing lifecycle
    Given the separate healthy fixture passes capacity and meaningful warm-up
    When I request exactly 100 percent new admissions
    Then actual fixed green receipts preserve session, state, effects and the original latency budget
    And two existing blue journeys remain running
    When I observe their bounded drain and the fixed rollback-retention receipt
    And request retirement
    Then four synthetic journeys pass and no work or sessions depend on the retired deployment
    And platform restarts and independent dependency or regional fault domains are not certified

  Scenario Outline: Successful-shaped routing cannot conceal interruptions or uncertainty
    Given the separate-plan "<fixture>" observations
    When I warm and request exactly 100 percent new admissions
    Then "<outcome>" is measured and retained
    And further draining or retirement cannot manufacture uninterrupted completion

    Examples:
      | fixture           | outcome                                             |
      | session-loss      | interrupted journey despite HTTP 200                |
      | missing-receipt   | unknown transition without an endpoint receipt      |
      | pinned-client     | blue success is not proof of green migration        |
      | dependency-outage | both compute pools depend on the same failed service |
      | platform-restart  | independent routing does not prevent a host restart |

  Scenario: Drain observation remains incomplete
    Given the separate drain-pending fixture has verified green admissions
    When I inspect the fixed drain receipt
    Then two old journeys remain outstanding and the result is unknown
    And retirement and rollback-window completion are unavailable

  Scenario: Invalid inputs and forged state fail closed
    When I enter a coerced, fractional, padded or unsupported admission percentage
    Or provide extra command fields, forged counters, invalid command history or unknown fixture identifiers
    Then no state or retained trace changes
    And the browser announces a useful error and focuses its labeled control
    And changing a locked fixture cannot change a run already in progress

  Scenario: Keyboard reset and resource failure are explicit
    Given the page is loaded directly with no server
    When I use Tab, Enter and Space to conduct the lesson and reset
    Then reset restores the fixed initial state and focus without form.reset shadowing
    And failures remain in history until that explicit reset
    When the lesson script cannot load
    Then a visible startup error remains and controls stay disabled

  Scenario: Actual CSP enforcement and read-only verification
    When the real browser attempts inline script, eval, data connections or form navigation
    Then the corresponding CSP directives block them
    And normal verification changes no owned source or evidence bytes
    And only exact CAPTURE_BROWSER_EVIDENCE=1 permits a deliberate new browser observation record
