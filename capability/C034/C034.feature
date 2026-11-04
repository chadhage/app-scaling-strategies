Feature: Inspect an actually saved original client's action, version and outcome order
  Original C034 is one frozen S / P0 unit in LP-REPLAY, under incomplete H006/H007.
  Independently accepted C020 and C015 are required; accepted C033 supplies historical browser observations.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario: Decode a source-pinned historical saved browser trace
    Given exact accepted C033 saved DOM and browser report bytes
    And actual C015 public restore has read its known immutable synthetic run and epoch
    When I inspect the saved original client history
    Then actions and acknowledged responses retain their actual original order and monotonic times
    And each acknowledged v1 or v2 reply matches unchanged C020 business values and immutable stamps
    And implementation versions 1.0.0 and 2.0.0 preserve API contract getProfile/1
    And the C015 record is a declared fixture association, not client/run/lease/user correlation
    And no imported trace becomes a live run, approval, authenticated identity or migration attestation

  Scenario: Reject a genuinely wrong-ordered saved trace
    Given an actually saved C033 trace with a requested read and its acknowledgment
    When the acknowledgment is moved before the request
    Then inspection fails with REQUEST_RESPONSE_ORDER
    And the loadable original stub genuinely fails this behavioral assertion before implementation

  Scenario: Preserve the original budget, interrupted attempts and incomplete snapshots
    Given a saved budget-exceeded original attempt and interrupted unknown originals
    When I inspect history or a held partial snapshot
    Then Resume has not restarted the original deadline
    And missing terminal evidence stays partial unknown
    And missing request tokens, headers, version observations and end times are not invented
    And a later replacement summary does not repair the interrupted original
    And incomplete replacement actions and timing remain unverified

  Scenario: Closed inspection cannot bless caller-owned evidence
    When JSON is malformed, duplicated, stale, oversized, rounded or has unknown fields
    Or action order, outcome, original identity, context, stamps or provenance differs
    Then inspection returns a canonical explicit error and clears stale results
    And arbitrary paths, URLs, headers and claimed verdicts confer no authority

  Scenario: Actual offline browser behavior is separate empirical proof
    Given offline Playwright 1.56.1, signed Edge 156 and Node 22
    And the unchanged published isolated helper is exactly pinned
    When actual DOM keyboard controls inspect, reject and reset a saved trace
    Then historical source, partial unknown, original ordering and retained errors remain visible
    And CSP blocks inline scripts and connections
    And the exact isolated browser closes and its created runtime directory disappears
    And no live disk, HTTP, native transport, lifecycle, authenticated run or Azure result is claimed

  Scenario: Normal verification is read-only
    When focused, syntax, browser and integrity checks run normally
    Then source, retained evidence, C015 demos and all other UUID namespaces are unchanged
    And only deliberate exact CAPTURE_BROWSER_EVIDENCE=1 appends a new unique C034 evidence directory
    And IaC is N/A with zero packages, cloud runs, deployment, credentials or spend
