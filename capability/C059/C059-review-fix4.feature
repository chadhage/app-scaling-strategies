Feature: C059 fourth review fixes (fifth worker): what waits behind a refusal never runs, the mutation run counts only causal kills, the F24 cost is measured, the identifier scan covers every changed file
  The third fix (ea81f6ec59c3) was rejected by rev-C059 on ONE major (D1: the mutant that deletes the call that drops what waits behind a Node parse error survived every committed suite, although a queued request then applied its effect) and minors D2 to D6, D10 and D11. The production bytes stay UNCHANGED.
  This specification is NEW; C059.feature, C059-review-fix.feature, C059-review-fix2.feature, C059-review-fix3.feature and every archived RED, GREEN and coverage run stay as they were.

  Scenario Outline: D1 a request queued behind a refusal never runs, for every kind of refusal
    Given a step in flight on connection A (the executor waits on a gate that the test releases) and a connection B
    And B sends the first request ("<first>"), a body-less cancel of the step of A and a refusal "<kind>", in "<shape>"
    When the refusal is decided (at once by Node's parser for a parse error, in its turn by the service for a refusal of the lane; for a lane refusal the cancel is queued behind it)
    Then B receives its answers in order, the last one is the typed refusal with Connection: close, and the connection is closed
    And after a barrier (a round trip on a third connection and event-loop turns, never a duration) the step of A is still in flight, A answers 201, the step is succeeded and never cancelled, and the lease ledger and the journal hold exactly the committed steps
    Examples:
      | first                       | kind                                                   | shape                                                |
      | a request that completes    | every Node-own client error that can be reached (400, 431) | everything in one write                          |
      | a second slow step          | the same, and a request that is never completed (408)  | everything in one write                              |
      | a second slow step          | the same                                               | the refusal in a later write after the first two were parsed |
      | a request that completes or a second slow step | every refusal of the table of tests\server.test.cjs and the refusals decided after the body was read | the cancel behind the refusal, in one write or in a later write |
    And the cancel that nothing refuses DOES run (a named control), and the rows after which Node parses nothing (a declared body that swallows what follows, Connection: close, an Upgrade) are named controls too

  Scenario: D1 the mutant that deletes decide(socket) from refuseMalformed is killed by assertion
    Given the server of the third fix with only that call deleted
    Then the family test fails by ERR_ASSERTION in every parse-error row (the step of A is cancelled and A gets 409) and passes in the lane rows and the controls, and the same file passes on the final server

  Scenario: D2 and D3 a mutant is killed only by a named test that fails by an assertion
    Given a run of the node test runner on a mutated tree
    Then a named test that fails by an assertion or by an error thrown inside it kills; a timeout of the runner, a file-level failure, a cancelled test, a failed hook, a crash and a run without a named failing test are UNDECIDED and fail the campaign
    And the private tree is compared with its pristine digest after every mutant and restored, and the suites run with the per-test cap of the README (900000 ms)
    And every equivalent mutant says what kind of proof it has: identity, a runnable demonstration, or reasoning only; the figures block counts them

  Scenario: D4 the cost of a pending first request is measured at the cap
    Given the service in a child with a capped heap and 32 sockets whose first request stays pending
    Then the live heap per socket, the total and the resident set are measured and written in the README with the command that reproduces them

  Scenario: D5 the scan for local identifiers covers every changed file
    Given every file added or modified since the sealed evidence, and every decompressed gzip transcript
    Then none carries a local Windows user name, a session id or a user-profile path, and a planted identifier is found by name

  Scenario: D6, D10 and D11 the README and the manifests say what they contain
    Given the new GREEN manifest, the branch coverage of server.cjs and the refusal table
    Then the purpose text says what the capture contains (only the total time), the branch coverage is stated with the range between runs, and the counts of the table are derived from it
