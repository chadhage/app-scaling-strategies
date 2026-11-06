Feature: X001 scrub a saved run timeline backward and forward without re-execution
  Training rehearsal - synthetic data - not a live Azure result. A saved run is a recorded list of entries produced by an
  accepted producer (a C044 console session, a C034 saved client trace) plus fictional hostile sets. The timeline folds the
  recorded entries with the SAME reducer the live console uses (C044 reducer.js, read-only and pinned) and shows the
  limits of the recording honestly. Nothing is run again: no producer, server, timer or network is started.

  Background:
    Given the saved runs of tests\build-saved.cjs and the pins of imports.json

  Scenario: stateAt is the fold of the recorded entries and nothing else
    When a position i is asked for
    Then the state is the C044 reducer folded over entries 0..i from its initial state
    And the same state is returned after any sequence of forward, backward and jump moves (path independent)
    And verify recomputes every position from the raw entries and finds no mismatch

  Scenario: a position outside the recording is typed NOT_RECORDED, never the nearest state
    When position -1, the length, NaN, 1.5, a string or null is asked for
    Then the answer is { ok: false, code: NOT_RECORDED } and carries no state
    And a sequence inside a gap, before the first recorded or after the last recorded sequence is NOT_RECORDED with its exact range

  Scenario: the limits of a recording are shown and never interpolated
    Given a recording with a true gap, replayed duplicates, an epoch change, a failure and an unknown event
    Then the gap names its exact skipped range and the missing sequences are listed as not recorded
    And a replayed duplicate is counted and marked DUPLICATE, never shown as a new applied event
    And an epoch change is listed with its position
    And a failed entry is marked FAILED and an unknown event or entry type is marked UNKNOWN, never success-shaped
    And a recording that stops before the producer total is INCOMPLETE and shows recorded of total

  Scenario: a hostile or damaged saved run is refused with a typed code
    Given a truncated, reordered, tampered or unknown-code C034 trace
    Then build answers { ok: false } with the decoder code and shows no timeline, never a partial one
    And a malformed saved run, a foreign format or a non-array entry list is refused with a typed code

  Scenario: the page is keyboard operable and keeps the displayed state equal to the fold
    When the slider has focus and Left, Right, PageUp, PageDown, Home or End is pressed
    Then the position moves by 1, 1, 10, 10, to the first or to the last, never beyond the recording
    And the Previous and Next buttons and the jump buttons (gap, failure, unknown, epoch change) move to the exact target
    And every displayed count equals the count derived from entries 0..i
    And the producing entry is highlighted with a text label and an aria-live announcement says
      "Position 12 of 40: step 12 of 20 completed; 2 failed events so far"
    And the list shows every entry once: failed and unknown entries never disappear and ids are unique

  Scenario: the position lives in the URL fragment and a hostile fragment is harmless
    Given the fragment #run=<id>&pos=<n>
    Then a valid fragment shows that run at that position and every move rewrites it
    And a malformed, unknown, repeated, oversized or script-like fragment shows a typed refusal, echoes nothing, never throws
      and leaves the displayed run and position unchanged

  Scenario: scrubbing makes zero network requests
    When the page is loaded and scrubbed with fetch, XHR, EventSource and WebSocket stubs installed
    Then no stub is called and the content security policy has connect-src 'none'
