Feature: C059 third review fixes (fourth worker): the suite is green, the pins accept either line-ending form, the refused request itself is tested, the pending-socket cost is a documented bounded limit, the journey tables are frozen
  The second fix (c2390608) was rejected by rev-C059 on two majors (K1: a red published suite; M2: a raw-only pin of another namespace's working bytes) and minors Q1 to Q9.
  This specification is NEW; C059.feature, C059-review-fix.feature, C059-review-fix2.feature and every archived RED, GREEN and coverage run stay as they were.

  Scenario: K1 the published suite passes
    Given the two integrity rules that pin a full mutation run and a load loop
    Then both are captured on the final bytes and pass, and no committed test is red

  Scenario Outline: M2 an import pin of another namespace's working bytes accepts either form of the accepted file
    Given the nine imports pinned by their raw hash, their LF-normalized hash and their accepted git blob
    When the working bytes are "<form>"
    Then the verification reports no WORKING_COPY_DIFFERS, whatever the other hash of the pin says
    Examples:
      | form                                              |
      | the raw bytes of the machine that recorded the pin |
      | their LF-normalized form (an LF checkout)         |
    And an edited file, or a file for which both hashes are wrong, is refused by name; BLOB_MISMATCH, TAG_MISMATCH and PIN_NOT_ACCEPTED_BYTES stay

  Scenario: Q1 the refused request ITSELF applies nothing
    Given a POST that carries a VALID step body and an unknown Expect (Content-Length and chunked), or asks for 100-continue and is refused
    Then the typed refusal arrives, the connection closes, the step key was never recorded, and the lease ledger and the journal record count are as before
    And the same step sent plainly is applied once
    And the reviewer's mutant S1 (the return after the 417 deleted) is killed by name: the lane rows put a valid step in the refused request and the sequential test compares the ledger and the journal

  Scenario: Q2 a pending first request costs a bounded amount per socket
    Given a service whose first request on three sockets stays pending and 64 KB blocks of tiny GETs behind each
    Then the request events per socket stay within ONE read however much the client sends, every socket is closed, a legitimate GET is answered and a 48 MB child survives
    And the connection cap read back from the server is 32: of 128 idle sockets it keeps 32, Node drops the rest at accept, and every socket is accounted for

  Scenario: Q3 and Q7 the journey tables are frozen and an answer is judged only against its request
    Given every export of journey.js and a11y-check.js and every return value of their functions
    Then every reachable table is deeply frozen, a write is refused in strict mode and a later call made with a fresh clone gives the identical output
    And journey.present refuses an answer when the caller does not name the request it answers (EXPECTED_REQUIRED), and the transcript is checked against the request recorded with each exchange

  Scenario: Q5 deleting the explicit destroy after a refusal is equivalent
    Given every refusal says Connection: close
    Then Node itself ends the connection after the flush, in every shape that matters, and a control without the header keeps the connection
