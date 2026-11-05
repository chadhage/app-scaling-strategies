Feature: C034 sealed tests have an owned, chained, append-only amendment path
  U020 is a zero-credit unblock item that publishes under the original C034 / S card. It adds no production code.
  The C034 seal (evidence\seal-8afff407-c346-44d3-aebd-ab3c09f04895.json) pins the raw SHA-256 of every source and test file and is
  never rewritten. A numbered addendum chain (evidence-index-addendum-N.json) may supersede only closed, named test files, and only by
  naming the exact bytes it supersedes and the exact bytes that replace them.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario: The K-C034 pin edit is rejected today because the seal has no amendment path
    Given a scratch copy of the C034 namespace that is not the repository tree
    And the retained sealed v1 integrity test
    When the one-line K-C034 edit of tests\surface.test.cjs is applied to the scratch copy
    Then the v1 integrity test fails at the sealed raw SHA-256 check of tests\surface.test.cjs
    And the same scratch copy without the edit passes that check

  Scenario: Sealed bytes stay exact when no addendum supersedes them
    Given the seal entries and no addendum
    Then every sealed file must keep its sealed raw SHA-256 and its separate LF-canonical SHA-256
    And any changed byte in any sealed file is rejected naming the path

  Scenario: The exact K-C034 one-line replacement of tests\surface.test.cjs is accepted
    Given an addendum that supersedes d74cd7bf for tests\surface.test.cjs with the SHA-256 of the exact K-C034 edit
    When tests\surface.test.cjs holds the sealed bytes or exactly the replaced bytes
    Then the sealed file check accepts it
    And the replaced bytes are the sealed bytes with line 41 reading the archived publisher snapshot instead of the live private publisher

  Scenario: Any other change to tests\surface.test.cjs is rejected
    Given the same addendum
    When tests\surface.test.cjs holds any other bytes, including the K-C034 edit with LF line endings
    Then the sealed file check rejects it naming the path and both expected hashes

  Scenario: A change to another sealed file is rejected even with a valid addendum
    Given a valid addendum for tests\surface.test.cjs
    When any other sealed source, test or evidence file, or the seal itself, changes
    Then the check rejects it

  Scenario: An addendum may supersede only the closed list of amendable test files
    When an addendum supersedes a production file, a sealed evidence file, the seal or any unnamed file
    Then the chain is rejected with AMENDMENT_PATH_NOT_ALLOWED

  Scenario: A modified addendum is rejected
    When an addendum changes its schema, card, sequence, base, chain link, key set, statuses or hashes
    Then the chain is rejected, and replaced bytes that no longer match the working file are rejected
    And a published addendum whose working bytes differ from the committed bytes is rejected

  Scenario: A missing addendum is rejected
    When addendum numbers have a gap, or an addendum committed to the repository is absent from the working tree
    Then the chain is rejected
    And a changed sealed test without an addendum is rejected

  Scenario: The chain is append-only
    Given addendum 1 supersedes sealed bytes
    When addendum 2 supersedes the same path
    Then it must name the bytes addendum 1 produced, never the sealed bytes again
    And addendum 2 must name the SHA-256 of addendum 1 as its previous link

  Scenario: The replaced integrity test is itself chained and pins the amendment logic
    Given the sealed integrity test is superseded by an integrity test that reads the chain
    Then the addendum names the sealed bytes it supersedes and the exact bytes that replace them
    And the integrity test pins the raw SHA-256 of the amendment helper it relies on

  Scenario: Published history is the only other legitimate committed state
    When a sealed file in the committed tree holds a state the chain never legitimized
    Then the published byte gate rejects it
    And a committed sealed file may hold any state the chain has legitimized

  Scenario: New evidence is indexed as new files only and stays byte exact
    Given an addendum that lists new evidence files by raw SHA-256
    When a listed file is a sealed path, a path under evidence\raw, outside the evidence folder, listed twice or malformed
    Then the chain is rejected
    And a listed file whose bytes change is rejected naming the path
