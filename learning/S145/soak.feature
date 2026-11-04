Feature: Repeated transition and soak accounting from fixed fictional teaching data
  The original S145, D-S145 and A-S145 contracts are independently frozen.
  Nothing here operates on processes, memory, connections, caches, storage,
  networks, load generators, Azure, or real user data.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And one original fictional fleet baseline of 100 MiB, 8 connections, 20 cache entries
    And four declared cycles c1 swap v1 to v2, c2 rollback v2 to v1,
        c3 swap v1 to v2, c4 rollback v2 to v1
    And every cycle declares four fictional transition journeys at the same fixed load
    And cumulative growth limits are 8 MiB, 4 connections and 8 cache entries
    And every original journey has a fictional 150 ms completion budget

  Scenario: Equality passes only after the entire declared sequence
    When the operator conducts and inspects the threshold-equality trace in order
    Then final resources are 108 MiB, 12 connections and 28 cache entries
    And maximum growth from the original baseline is exactly 8, 4 and 8
    And all 16 complete intended-version journeys pass, including 150 ms equality
    And the measured whole-sequence verdict is PASS

  Scenario Outline: Small per-cycle increments accumulate past an original limit
    When the operator conducts all four cycles of <trace>
    Then all 16 fictional journeys can still be successful
    But the <metric> maximum original-baseline growth is <growth>
    And the cumulative verdict is FAIL, not a real leak diagnosis
    Examples:
      | trace             | metric       | growth |
      | memory-growth     | memoryMiB    | 12     |
      | connection-growth | connections  | 8      |
      | cache-growth      | cacheEntries | 12     |

  Scenario: Recovery cannot delete an earlier observed growth breach
    When memory rises to 109 after c1 and returns to 100 after c4
    Then latest growth is 0 but retained maximum growth is 9 above the limit 8
    And c1 remains an attributable FAIL despite successful later cycles

  Scenario: Recovery cannot reclassify an original interruption
    When c1 journey J145-c1-4 takes 151 ms and c2 records its separate recovery
    Then attempted journeys are 16, uninterrupted 15, interrupted 1, unknown 0
    And the original failed journey and its recovery remain in the same record
    And the cumulative verdict is FAIL

  Scenario: Unobserved cycle or metric is never inferred from later throughput
    When c2 has no cycle evidence, a required metric is absent, or baseline is absent
    Then the unavailable cumulative metric is null and required evidence remains UNKNOWN
    And every declared cycle, original baseline, known sample and missing ID is retained
    And known failures take precedence over unknown evidence without erasing it

  Scenario: Cancel, resume, inspect, and measure preserve one original sequence
    When the operator cancels the segment after c1
    Then one conducted cycle does not certify the four-cycle declaration
    And the paused report preserves c1, baseline, pending c2 through c4 and unknown verdict
    When the operator resumes and conducts c2 through c4
    Then cancellation and all earlier receipts and measurements are still inspectable

  Scenario: Reset archives rather than launders accumulated evidence
    Given a failed or unknown attempt
    When the operator archives and resets and completes a separately successful trace
    Then full prior baselines, declarations, journals and verdicts remain inspectable
    And session FAIL or UNKNOWN cannot become PASS because of the new successful attempt
    And twelve attempts and six journal actions per attempt bound retained data without truncation

  Scenario: Strict typed and replayed guards reject forged actions
    When a receipt is missing, stale, duplicated, out of order, string-typed, extended or forged
    Or a state has an altered journal, counter, prototype, accessor or unknown trace
    Then the model rejects it before mutation and preserves the original state
    And disabled DOM controls do not bypass domain guards

  Scenario: Actual browser conduct and safety
    Then labelled native controls work with Tab, Shift+Tab, arrows, Enter and Space
    And invalid choices show a focused alert without modifying data
    And reset restores defaults and focus without shadowing native form.reset
    And narrow-screen output remains readable and all retained records remain available
    And actual CSP blocks inline scripts, inline handlers and inline style
    And connect-src is none and no external request is performed
    And normal verification writes nothing
    And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately creates a unique raw capture
    And the published isolated browser helper is closed in an awaited finally
