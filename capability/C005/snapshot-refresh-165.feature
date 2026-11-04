Feature: One fixed 165-unit snapshot exposes every accepted portable practice
  OP-CATALOG-SNAPSHOT-REFRESH-165 / worker-OP-CATALOG-SNAPSHOT-REFRESH-165
  Zero S/D/L and original-unit credits; operational acceptance belongs to the parent

  Scenario: Genuine behavioral RED against the unchanged loadable 135-practice snapshot
    Given all 635 current owned files have an initial raw-byte manifest before edits
    And all 561 historical proofs, including the earlier 517, remain unchanged
    And the current catalog is loadable and passes the unchanged C005 validator
    And its source is ebd7433ac143242ab633b52aff864bb2923dac2c
    And its exact data SHA256 is 00df2f58566b4cb663b8dabcb175ef96fb7bdac269256781b34d29f579467863
    And immutable source c8b3139f07aa60a64833a5380503b2bd794c0e0e accepts 165 original units
    And those units are 163 S plus 2 D, including all A-S001 through A-S150
    When the new source, full-coverage and fifteen S136 through S150 assertions run
    Then all seventeen positive leaves genuinely fail on the unchanged old data
    And the native, workflow, parent and approval negative-gate leaf passes
    And exact raw assertion streams and every failed attempt remain archived
    When IaC is recorded not applicable after RED
    Then no infrastructure, package, download, identity, backend, deployment or spend is introduced

  Scenario: Only the existing deterministic full-SHA pin determines availability
    Given the original source ledger timestamp is 2026-11-04T05:06:14.4697468Z
    And its Git commit timestamp is 2026-11-04T05:06:17.000Z
    When original Git JSON is parsed with Node JSON.parse and Date.parse
    Then the existing unchanged chronology validator accepts the source
    And no timestamp falsification, rounding, schema or validator relaxation occurs
    When only the existing generator's full source SHA changes
    Then its existing 8 MiB Git-read bound and extraction semantics are unchanged
    And C005 catalog, C006 literal search, C007 AND filters and C008 preparation expose all 150 practices
    And the existing local learner composition exposes the same 150 original destinations
    And all 152 IDs, objectives, references, schemas, APIs and C001/C003 authorities remain unchanged
    But W001/W002 portable practice stays unavailable and all native/parent flags stay false
    And later live capability acceptance cannot change this fixed snapshot
    And H001, H002 and production Node 24 remain incomplete or unvalidated
    And S107 static links do not certify native CORS or HTTP-origin enforcement

  Scenario: Every preceding source and proof byte remains independently verifiable
    Given current source bytes are archived before their edits outside test autodiscovery
    And all eight 11/20/36/61/86/100/120/135-practice snapshots remain byte exact
    And the complete frozen 51-file failed-source and 85-file retry directories remain unchanged
    And the preceding 111 OP150 raw archives are 45 exact TXT files plus 66 gzip files
    And every other existing raw archive is preserved as well
    And the unqualified 86e31 tag and its published ancestor history remain unchanged
    And historical JSON objects d926db1c2939fffab907c107fbc8f8e513c9272a and e4db3be01d649dbb2053607dffdedab8e76046f1 remain exact
    When focused, schema, pin, historical, filter, preparation and integrity verification runs
    Then ordinary verification is strictly read-only across the full five-scope file set
    And canonical Git logical paths use Git separators while filesystem paths use Windows separators
    And new JSON metadata is written explicitly as UTF-8 LF
    And existing qualified narrow archival attribute exceptions are retained
    But historical proof bytes are never normalized merely to pass Git

  Scenario: Actual signed Edge visits every unique destination and conducts the learner journey
    Given only published testing\browser\isolated.cjs with openIsolatedLesson is used
    And its SHA256 is 86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055
    And offline Playwright 1.56.1, signed Edge 156 and Node 22 tooling are already installed
    When all five affected real-browser suites deliberately capture with exact CAPTURE_BROWSER_EVIDENCE=1
    Then all 150 unique learner destinations are actually opened and match their original URLs
    And every visit shows exactly "Training rehearsal - synthetic data - not a live Azure result"
    And S001 conducts synthetic PASS, negative FAIL, reset and return with query plus all AND filters retained
    And operator/native controls do not imply any native execution or qualification
    And every helper close is awaited in finally and the lifecycle prototype remains unqualified and inactive
    And capture-unset model and browser replays append, delete and rewrite no owned files
    And Node parent records, leaf checks, internal DOM cases and repeated navigations are counted separately

  Scenario: Publish one explicit zero-credit transaction and stop
    Given all five owned scopes have an explicit verified publication inventory
    And checked-out main exactly equals remote main before the transaction
    And only the existing publisher mutex is acquired, with no state lock inside it
    When canonical-path filtered Git object predictions are verified before staging and commit
    And git commit --only publishes exactly those paths while preserving unowned index bytes and flags
    Then the real commit is marked [flow][catalog-refresh][no-kano-credit] with the Copilot trailer
    And annotated kanban/flow-catalog-refresh/<realcommit12> plus main are pushed atomically
    And committed raw bytes, remote tag objects, peeled targets and ancestry are verified
    But any postcommit byte, tag or push failure stops and reports the exact commit without fallback
    And no reset, amend, force, guard widening, unowned lock removal, ledger or Kanban edit occurs
    And a standalone postpublication report is explicitly distinguished from the committed result
    And this worker stops after exactly one fresh OP165 with no acceptance or extra-credit claim
