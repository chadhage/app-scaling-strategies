Feature: Gate attribution before attaching evidence to a current local fixture
  C036 is the original D / P0 / H001 packet unit under incomplete H001 and H007.
  C015 and C034 must independently be Done. No Azure, control API, authentication
  service, lease authority, infrastructure, deployment, packages or spend exists.
  Every surface says Training rehearsal - synthetic data - not a live Azure result.

  Scenario: Reject false attribution before the private attachment transition
    Given the expected context belongs to the local fixture owner, not the caller
    And the C015 current known run, epoch, existing record and digest were actually restored
    When evidence names another run, user, lease, epoch, attempt, request, tier or stamp
    Then the guard rejects before attachment
    And current attributed records and metrics do not increase
    And the negative result is retained

  Scenario: Missing correlation is unverified, not inferred identity
    Given unchanged source-pinned C034 saved client observations
    And its C015 association is only a declared fixture association
    And no authenticated client, lease, user, run or epoch correlation was saved
    When the saved closed or held partial trace is inspected and offered for attachment
    Then required absent correlation fields stay UNVERIFIED/HOLD
    And profile, labels, health, versions and HTTP 200 cannot fill them
    And other originals and the summary-only replacement never count as current

  Scenario: Verify only an explicitly closed fictional positive control
    Given explicit fictional lease, user, context, attempt and request identifiers
    And complete typed observations of all three declared fictional tiers in order
    And the observed run and epoch match a separately restored C015 fixture association
    When the local gate revalidates the evidence before its private attachment
    Then exactly three fictional tier records may attach to that current local fixture
    And fixture verification is separate from native and authenticated correlation
    And the result grants no identity, lease, authorization or production authority

  Scenario: Reject stale, replayed or changed-epoch evidence
    Given an inspection result is not an attachment capability
    When the owner rereads a newer actual C015 epoch before attaching old evidence
    Or evidence is stale, replayed, duplicated, reordered or from a newer attempt
    Then no old or other observation can attach to the current context
    And resetting presentation does not erase replay or negative history
    And fresh epoch-change tests use only public C015 persist in a unique new test UUID
    And cleanup removes only tracked created files and empty owned directories

  Scenario: Reject forged, malformed and wrong-typed data without partial attribution
    When input contains a claimed eligible verdict, caller context or provenance
    Or inherited, accessor, symbol, hidden, sparse, wrong-version or wrong-typed fields
    Or duplicate JSON keys, unsafe numbers, bad UTF-8, excess bytes or partial observations
    Then the guard rejects or holds explicitly without a partial attachment or metric
    And known mismatches are rejected even if another required field is missing

  Scenario: Inspect through an actual keyboard-accessible offline browser
    Given a clearly historical bundled C015 observation, never a live disk read
    When Tab, Enter and Space inspect, correlate, attach, fail and reset the display
    Then actual signed Edge DOM shows error, unknown, mismatch and retained history
    And enforced CSP denies inline script and connections
    And the exact published isolated helper and actual owned browser close in finally
    And native TCP, WebSocket, CORS and broader lifecycle qualification are not claimed

  Scenario: Preserve source, evidence and current publication authority
    Given normal verification is read-only for source and all retained proof
    When exact CAPTURE_BROWSER_EVIDENCE=1 deliberately captures proof
    Then only a new unique own raw-proof directory is appended
    And the genuine assertion RED, failed attempts and original raw bytes survive
    And current parent publisher authorization is reread under the state mutex
    And an unknown unauthorized publisher change fails without Git writes
    And scoped annotated main and tag publication earns no credit until parent acceptance
