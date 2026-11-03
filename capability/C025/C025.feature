Feature: C025 / H005 / S — resume the exact synthetic artifact over real HTTP
  C020 is the accepted, unchanged provider. This is one local satisfier, not H005
  completion, durable storage, Azure Blob, authentication, deployment or Node 24 proof.

  Scenario: Repeat an immutable original
    Given the accepted C020 synthetic profile and a fixed fixture version
    When the original bounded binary artifact is generated twice
    Then both byte sequences and their SHA-256 digests are identical
    And its C020 implementation and deployment lineage is inspectable
    And callers cannot modify another caller's bytes or the source fixture

  Scenario: Interrupt and resume through an actual owned HTTP listener
    Given a listener bound only to 127.0.0.1 with an explicit lifetime at most 15 minutes
    And a pinned artifact identity, strong ETag, length, version and original SHA-256
    When GET Range accepts bytes 0-1023 and the conductor pauses
    Then the accepted inclusive interval and next missing byte cursor are visible
    And the assembly is incomplete, not successful
    When further GET Range requests with the pinned If-Range resume from that cursor
    Then each real response is 206 with coherent Content-Range and actual partial bytes
    And only complete coverage plus a freshly computed matching SHA-256 proves exact bytes
    And the final bytes equal an independently fetched whole original artifact

  Scenario: Inspect arbitrary single ranges without fabricating coverage
    When suffix, open-ended, clamped, duplicate or out-of-order ranges are fetched
    Then accepted intervals are normalized and duplicates do not inflate coverage
    And a hole keeps the cursor at the first missing byte
    And conflicting overlap or inconsistent length, ETag or range headers accepts no new bytes

  Scenario: Reject invalid and unsatisfiable inputs
    When malformed, multiple, reversed or unsafe-integer ranges are requested
    Then the HTTP fixture explicitly rejects them rather than returning painted success
    When a well-formed range starts outside the artifact or has zero suffix length
    Then HTTP 416 exposes Content-Range bytes */total
    And invalid queries, unknown profiles, unknown versions and unsupported methods fail

  Scenario: A version change cannot produce a mixed-artifact success
    Given an incomplete assembly pinned to r1
    When r2 is requested using r1's If-Range
    Then real HTTP returns the complete new representation with status 200, not 206
    And the client rejects that representation and retains r1's bytes and failure
    And If-Match against the other version yields 412
    And a forged ETag, wrong artifact, wrong total or corrupt final bytes cannot verify
    When the conductor restores r1 and resumes
    Then exact original bytes may verify, but earlier failures remain visible

  Scenario: Failure and uncertainty remain explicit
    When a request fails, its result is unknown, or final coverage or hashing is incomplete
    Then there is no success-shaped fallback, invented hash or auto-restart onto a new artifact
    And failed or unknown attempts remain inspectable until an explicit reset
    And reset discards the in-memory assembly and clears stale verification

  Scenario: Conduct with an accessible browser
    Given the unchanged published isolated-loopback helper and the actual owned HTTP server
    When a conductor uses real Tab and Enter to pin, fetch and resume
    Then labelled controls, live status, accepted ranges, cursor and hashes update in the DOM
    And invalid-range, version-change, unknown-request and reset paths are observed in that DOM
    And pending operations disable competing controls
    And CSP blocks inline script and the page has no external request or uncaught error
    And verification does not rewrite published evidence unless CAPTURE_BROWSER_EVIDENCE=1
    And nested cleanup awaits session.close and then closes the exact owned server
