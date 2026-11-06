Feature: C021 accepts files ADDED under the accepted C020 tree through an owned, chained, append-only amendment path
  U032 is a zero-credit unblock item that publishes under the original C021 / S card. It adds no production code and changes no page.
  C021 tests\integrity.test.cjs test 1 diffed the WHOLE tree capability\C020 against the accepted commit 2dc471da, so a staged or committed
  new file under C020 failed it. The sealed manifest evidence.json pins the raw SHA-256 of that test (4a399f82...) and is never rewritten.
  A numbered addendum chain (evidence-addendum-N.json) supersedes exactly the bytes of tests\integrity.test.cjs and nothing else.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario: A new file under capability\C020 fails the sealed v1 integrity test today
    Given a scratch repository that holds the accepted C020 tree at commit 2dc471da and the retained sealed v1 integrity test
    When one new file is committed under capability/C020 of the scratch repository
    Then the v1 test 1 fails because git diff --exit-code against 2dc471da reports the added file
    And the same scratch repository without the new file passes that test

  Scenario: Added files are accepted whether they are untracked, staged or committed
    Given the drift check of the amended integrity test and the accepted C020 tree
    When a file is added under capability/C020 and left untracked, staged, or committed
    Then the drift check reports nothing

  Scenario: Any modified byte of the accepted C020 tree is still rejected
    When an accepted C020 file is edited in the working tree, in the index or in a commit
    Then the drift check reports it with its path

  Scenario: A deleted file of the accepted C020 tree is still rejected
    When an accepted C020 file is removed from the working tree, from the index or by a commit
    Then the drift check reports it with its path

  Scenario: A renamed file of the accepted C020 tree is still rejected
    When an accepted C020 file is renamed inside C020 or moved out of it, staged or committed
    Then the drift check reports the old path

  Scenario: The replaced integrity test is accepted only through the addendum
    Given evidence.json pins the sealed v1 bytes of tests\integrity.test.cjs and addendum 1 supersedes them
    When tests\integrity.test.cjs holds exactly the bytes named by addendum 1
    Then the sealed file check accepts it
    And the sealed v1 bytes are no longer accepted

  Scenario: Any other change to tests\integrity.test.cjs or to another sealed file is rejected
    Given the same addendum
    When tests\integrity.test.cjs holds any other bytes, or any other sealed file changes
    Then the sealed file check rejects it naming the path

  Scenario: A modified or missing addendum is rejected
    When addendum 1 is missing, or its base, chain link, superseded hash, replacing hash, schema, shape or sequence differs
    Then the chain is rejected or the replaced test no longer matches its pinned bytes

  Scenario: An addendum may supersede only the closed list of amendable files
    When an addendum supersedes any file except tests\integrity.test.cjs, indexes a sealed or foreign evidence file, or repeats a path
    Then the chain is rejected

  Scenario: The helper that the amended integrity test trusts is pinned by its raw SHA-256
    When tests\amendments.cjs holds any other bytes than the pinned ones
    Then the amended integrity test fails

  Scenario: The limits are stated
    Then the README states that a consistent rewrite of the test and its addendum together is not detected by the namespace itself
    And it lists which protections of the old whole-tree form are dropped on purpose and which are kept
