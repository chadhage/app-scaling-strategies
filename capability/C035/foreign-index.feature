Feature: Publication preserves ordinary foreign staged index entries
  # Repair slice of the one original C035 / D; it earns no extra credit.
  # Training rehearsal - synthetic data - not a live Azure result
  # The earlier pin of one live staged C048 entry could not hold after the unscoped commit dd49966d.
  # Every scenario builds its own throwaway Git repository; none reads the live index or HEAD.

  Scenario: A foreign staged entry survives the standard own-path commit
    Given a repository whose index stages a modified file outside the own namespace
    And the own namespace has unstaged changes
    When the own paths are staged and committed with --only exactly as the standard publisher does
    Then the foreign name-status, stage-0 entry, ordinary flag and index stat data are unchanged
    And the foreign content is not committed

  Scenario: No foreign staged entries is an explicit empty baseline
    Given a repository whose index stages nothing outside the own namespace
    When the foreign index is read
    Then the baseline lists no paths and no entries, and it is not fabricated from history

  Scenario: Own staged entries are never counted as foreign
    Given the own namespace has staged changes and no other path is staged
    When the foreign index is read
    Then no foreign path is reported

  Scenario: Restaged, unstaged or deleted foreign content is detected
    Given a foreign staged entry was read
    When the foreign path is restaged with other content, unstaged, or staged as deleted
    Then verification reports the entry as changed and preserved is false

  Scenario: Changed ordinary flags are detected
    Given a foreign staged entry was read
    When its assume-unchanged flag changes
    Then verification reports the flags as changed

  Scenario: A newly staged foreign path is detected
    Given a foreign staged entry was read
    When another path outside the own namespace becomes staged
    Then verification reports the path list as changed

  Scenario: Inherited repository location variables cannot redirect the read
    Given GIT_INDEX_FILE and GIT_DIR point at another repository
    When the foreign index of the named repository is read
    Then only the named repository index is observed

  Scenario: Unusual names and closed commands stay exact
    Given a foreign path containing glob characters and spaces
    When it is read and verified through the closed snapshot and verify commands
    Then it is matched literally, and every other command or argument shape is rejected with exit code 3

  Scenario: The PowerShell guard fails closed
    Given a delegated operation that preserves the foreign entry
    When the guard runs it
    Then the guard reports the before and after snapshots
    And a delegated operation that clobbers the foreign entry makes the guard throw

  Scenario: The publication wrapper delegates to the guard and never pins live state
    Given the actual publication wrapper source
    Then it wraps the standard publisher call in the guard
    And it no longer requires one live staged C048 entry
