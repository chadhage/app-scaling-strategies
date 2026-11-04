Feature: C045 opens independently isolated local GA and preview clients
  C045 is the original S unit, P0, H008, gated by accepted C020 and C041.
  This trusted local client is not a C041 lesson or an authorization extension.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario: Open two actual independently isolated browser clients
    Given current C001 local.probe consent is read while holding the state mutex
    And accepted C020 providers and C041 operating limits remain unchanged
    When each caller-owned IPv4 loopback server is opened with the published isolated helper
    Then GA and preview have different actual pages and browser contexts
    And there are no painted substitutes or invented window identifiers
    And each context has only its own origin, assets and fixed read-only provider

  Scenario: Separately observe synthetic profile selection and actual destinations
    Given GA uses getProfileV1 and preview uses getProfileV2 from unchanged C020
    When native keyboard submission selects an explicit synthetic profile in each client
    Then both actual HTTP bodies preserve the same getProfile/1 contract
    And exact server-owned headers and bodies expose implementation 1.0.0 or 2.0.0
    And each client's observed request and response URL identify its own actual listener
    And implementation versions are compatible implementations, not breaking API versions
    And profile identifiers, GA, preview and stamps are synthetic local labels only

  Scenario: Actions, errors and reset cannot interfere with the other client
    Given the clients retain distinct profile selections, drafts, results and request evidence
    When one client edits, submits an unknown profile, encounters an error or resets
    Then the other client's complete DOM state and destination evidence stay unchanged
    And failures clear only the failing client's stale success
    And a native reset works even when a form control shadows the reset property
    And no cookie, credential, persistent-storage session or child-parent bridge is used

  Scenario: Refuse authority and request overrides
    Given only fixed own assets and synthetic provider GET or HEAD requests are allowed
    When a foreign Host, Origin, path, method, body, profile field or stamp override is supplied
    Then it is explicitly refused without proxying, reflecting stamps or writing data
    And C041 A-S001/A-S003, sandbox, CSP and lesson-host authority remain unchanged
    And no Azure GA, preview entitlement, authenticated identity or signed attestation is claimed

  Scenario: Unknown state and cleanup are honest
    Given a static page or unavailable local scope has no actual server observation
    Then its HTTP destination and result remain visibly unknown and submission is disabled
    When bounded execution finishes or fails
    Then exact owned browser sessions and listeners are awaited in finally and closed
    And normal verification does not rewrite evidence
    And deliberate capture requires exact CAPTURE_BROWSER_EVIDENCE=1 and a unique owned slot
    And raw assertion bytes and checkout versus Git-canonical hashes remain separate
    And H008, native transport, production Node 24 and source-parent completion remain unproved
