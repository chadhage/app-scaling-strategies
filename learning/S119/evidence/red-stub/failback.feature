Feature: S119 controlled regional failback, using fictional teaching DATA only
  A-S119 / D-S119 / SC-S119 / one original S unit
  No resource, network, data synchronization, routing, writer, fence, identity,
  credential, Azure, or infrastructure operation is performed.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And fictional Amber is recovered while fictional Cobalt has served the users
    And all observations come from a fixed bounded fixture, never live telemetry

  Scenario: Synchronization and ownership precede a gradual, measured return
    When I select the aligned fixture and rehearse its restore
    Then restore evidence is positive but no journey has migrated
    When I attempt return before checking synchronization and ownership
    Then return is rejected before exposure and retained as a safe abort
    When I inspect equal committed watermarks and compatible state
    And I inspect the sole Amber writer, current epoch, and fenced Cobalt writer
    And I request the 25, 50, and 100 percent cohorts in that order
    Then the effective synthetic routing matches every requested cohort
    And six synthetic journey observations preserve identity, session, state,
        committed effects exactly once, and the 400 millisecond latency budget
    And completion is positive without implying a live or five-nines result

  Scenario Outline: Known failed and unknown gates do not permit user return
    Given the fixed "<fixture>" observations
    When I rehearse restore, inspect synchronization, inspect ownership, and return
    Then the "<gate>" is "<outcome>"
    And no gate-only success is counted as a completed migration
    And no failed or unverified observation is replaced by optimistic defaults

    Examples:
      | fixture            | gate            | outcome  |
      | restore-unknown    | restore         | unknown  |
      | lagging-state      | synchronization | negative |
      | sync-unknown       | synchronization | unknown  |
      | unfenced-writer    | ownership       | negative |
      | ownership-unknown  | ownership       | unknown  |
      | capacity-shortfall | return capacity | negative |

  Scenario Outline: Attempted journeys survive failed or unverified failback
    Given the "<fixture>" has passed the data and ownership gates
    When I progressively request return until the first non-positive result
    Then "<observation>" yields "<outcome>"
    And all attempted, failed, and unknown journeys remain in the denominator
    And later return is held rather than silently rolled back into success

    Examples:
      | fixture           | observation                     | outcome  |
      | continuity-break  | duplicate effect and lost state | negative |
      | latency-breach    | original journey budget         | negative |
      | routing-mismatch  | effective destination           | negative |
      | routing-unknown   | unobserved effective routing    | unknown  |
      | journey-unknown   | unobserved identity continuity  | unknown  |

  Scenario: Invalid, stale, forged, and excessive commands fail closed
    When inputs have wrong types, extra keys, unknown fixtures, or invalid cohorts
    Or state is forged, reordered, or disagrees with its retained evidence history
    Then an explicit input or state error preserves the previous state
    And no percent is clamped, coerced, or inferred
    And a maximum of 24 retained actions requires reset rather than evidence loss

  Scenario: Real browser keyboard, error, reset, and security behavior
    Given the lesson is opened as a standalone local HTML file
    When I use keyboard controls for the ordered positive and negative exercises
    Then the actual DOM displays the measured outcomes and retained trace
    And invalid percent input is focused and announced without discarding history
    And reset clears only this in-memory exercise and restores focus
    And inline scripts, eval, connections, images, and form navigation are denied by CSP
    And normal verification does not create, replace, or rewrite evidence
