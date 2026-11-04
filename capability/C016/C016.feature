Feature: Actual local conditional commands over the accepted C015 fixture
  Training rehearsal - synthetic data - not a live Azure result
  Original C016 is frozen D / P0 / H004 with C015 Done as its entry gate.
  IaC is N/A; H004, H012, native and production Node 24 remain incomplete.

  Scenario: Submit and retry in different actual Node processes
    Given a fresh unique C015 test UUID owned by this invocation
    And current literal C001 consent and exact scoped C015 fixture consent
    When a closed submit expects epoch 0 and publishes epoch 1 through C015
    And a different process retries the identical declared command
    Then the retry observes the matching C015 acknowledgment
    And exactly one immutable epoch file and intended local effect exist
    And the retry does not write or change any retained bytes

  Scenario: Conditional admission rejects invalid or conflicting commands
    Given an observed epoch 1
    When a command expects epoch 2 or supplies a different payload
    Then no new epoch is published
    And a precise negative result and permitted recovery are visible
    And unknown fields, run IDs, epochs and retained demo namespaces deny

  Scenario: Caller mutation cannot change a pending command identity
    Given a closed declared submit for synthetic-run-001 expecting epoch 0
    When the caller changes its object during asynchronous consent validation
    Then the captured original command and validated payload remain coherent
    And only the originally intended run can publish its local epoch

  Scenario: Concurrent duplicates do not fabricate success
    When two fresh Node processes release the same command concurrently
    Then one actual C015 publication supplies the intended epoch and effect
    And a loser reports a conflict or unknown until a matching restore confirms it
    And a remaining cooperative marker or pending publication prevents confirmation
    And no new lock, marker reclamation, schema or event store is introduced

  Scenario: A failed or unobserved client acknowledgment remains original
    Given a process exits after publication but before returning stdout
    When a later process observes and confirms the identical command
    Then its positive retry does not rewrite the original unknown attempt
    And replay preserves both raw attempts in a guarded bounded journal

  Scenario: Incomplete C015 publication holds without old-state fallback
    Given an actual C015 child exits after partial write, flush or publication
    When an actual fresh process inspects or retries
    Then it returns unknown with no acknowledgment and explicit operator review
    And it never reclaims the marker or paints a previous receipt as success

  Scenario: Browser conduct, inspect and retry are historical replay only
    Given bundled actual fresh-process observations and no live filesystem endpoint
    When the user conducts a recorded attempt and uses Tab and Enter to retry
    Then immutable positive, negative and original unknown attempts remain visible
    And invalid selections fail visibly and reset clears display and restores focus
    And CSP blocks inline execution, connections and form navigation
    And browser DOM evidence is distinct from actual Node filesystem proof

  Scenario: Normal verification is read-only
    When focused fresh-process tests, byte integrity, syntax or browser tests run
    Then C016 source and evidence and accepted C001 C002 C015 bytes are unchanged
    And only exact files and empty directories in newly created test UUIDs are cleaned
    And exactly CAPTURE_BROWSER_EVIDENCE equals 1 may append one unique raw capture
    And no shared root, sibling scratch or retained demo is modified
