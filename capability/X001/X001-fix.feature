Feature: X001 fix after the independent review of the first publication (368332e2a881): every finding has one scenario and one test that fails on the old bytes
  Local, synthetic, offline, fictional. Not a live Azure result. The first publication stays archived and immutable; this file adds scenarios only.

  Scenario: F1 fresh checkout, a pinned file of another namespace is accepted in its LF form and in its CRLF form
    Given the sixteen accepted files this namespace reads are present as git archive writes them (LF)
    When every suite runs in a scratch tree and again in the same tree with those files converted to CRLF
    Then every test passes in both trees and one changed byte of an imported file is refused in either form

  Scenario: F2 nothing the model returns or the caller holds can change a later answer
    Given a timeline built from a frozen saved run and from an unfrozen deep copy of it
    When every reachable object of every public return value is written to, deleted from, pushed to or truncated in strict mode
    Then every attempt on a returned object is refused, every later answer is byte-identical, the caller data is never frozen and verify compares flags and marks

  Scenario: F3 the displayed state is compared line by line with an independent fold
    Given every position of every valid saved run shown by the page
    Then all sixteen console lines or all seven trace lines, the announcement, the producing entry, every row, every button and the limits panel equal the fold
    And a systematic generator mutates every statement and every single condition of the displayed code and each survivor is killed by a named test or proven equivalent

  Scenario: F4 the position of a gap and of an epoch change is read by a test
    Then limits.gaps[].position is the 1-based position of the entry where the gap shows

  Scenario: F5 a failing verification is never shown as verified
    Given a verify that reports two mismatches
    Then the page shows VERIFICATION FAILED at 2 positions and keeps scrubbing

  Scenario: F6 build and verify are total over hostile JavaScript values
    Given sparse arrays, undefined, NaN, cycles, throwing getters, prototype keys and huge sizes
    Then the answer is a typed refusal or a timeline that answers every position, never a throw

  Scenario: F7 inconsistent producer metadata is refused
    Given a recording of sequences 1 to 22 and a producer total of 5
    Then build refuses with PRODUCER_INCONSISTENT and the pinned saved sets stay valid

  Scenario: F8 the integrity checks recompute every figure
    Given the transcripts, the DOM snapshot and the README of the final captures
    Then every summary figure is recomputed from them and a changed figure or README byte fails by name

  Scenario: F9 the README and the browser summary state what was observed
    Then a hostile fragment of a fresh load stays in the address and is never echoed by the page
    And the browser summary pins tests\invariants.cjs
