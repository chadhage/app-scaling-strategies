Feature: Introduce one synthetic shard without losing the committed boundary or writer ownership
  # A-S064 / D-S064 / SC-S064 / frozen Kano S; one portable unit, not native proof.
  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And one fixed synthetic tenant routes to shard-a with writer epoch 1
    And 1 to 6 committed effects are copied to a new shard-b snapshot
    And 1 to 3 additional effects commit on shard-a during the copy
    And a rehearsal has at most 8 retained attempts in memory

  Scenario: Complete synchronization and exclusive ownership allow assignment
    When the operator synchronizes shard-b through the required committed boundary
    And exclusive modeled fencing transfers ownership to epoch 2 before new writes
    And the operator assigns the tenant after synchronization
    Then all required committed effect IDs exist on shard-b before routing changes
    And the result is SUCCESS with zero missing committed effects and one candidate writer
    And a new destination write has exactly one effect
    And a stale source-epoch probe is rejected with zero duplicate effects

  Scenario: Assignment before synchronization is rejected
    When the operator attempts assignment before synchronization
    Then the result is FAILURE with a positive missing-committed-effect count
    And routing and the active writer remain on shard-a
    And no destination write or stale-writer probe is claimed to have run

  Scenario: A snapshot is not the committed handoff boundary
    When the operator assigns after a snapshot-only synchronization attempt
    Then the additional committed effects are explicitly missing on the candidate
    And the result is FAILURE and assignment remains blocked

  Scenario: Ambiguous ownership cannot pass even with synchronized data
    When the candidate contains every required committed effect
    But both shard-a and shard-b are proposed as active writers
    Then the candidate-writer count is 2 and the result is FAILURE
    And the model rejects assignment without enabling either competing proposal

  Scenario Outline: Missing observation is not success
    When assignment follows synchronization
    And synchronization observation is <synchronization>
    And ownership observation is <ownership>
    Then without a known failure the result is UNKNOWN
    And the source route is retained and unrun probes have unknown metrics
    Examples:
      | synchronization | ownership  |
      | unobserved      | exclusive  |
      | complete        | unobserved |
      | unobserved      | unobserved |

  Scenario: Known failure dominates an unknown observation
    When synchronization is unobserved but writer ownership is ambiguous
    Then the result is FAILURE rather than UNKNOWN or SUCCESS

  Scenario: Invalid input and forged state cannot change retained results
    Given an earlier retained result
    When a number is fractional, blank, out of bounds, or a selection is unsupported
    Or state contains a forged route, metric, trace, ordinal, or extra field
    Then a precise error rejects the action without mutating earlier results
    And the browser focuses the invalid control or bounded-state error

  Scenario: Keyboard, retained history, and explicit reset
    When the operator uses Tab and Enter to run a rehearsal
    Then results, gates, effect IDs, trace and every earlier attempt remain readable
    And attempt 9 is rejected without discarding any of the first 8 attempts
    When the operator activates Reset rehearsal from the keyboard
    Then defaults return, result and history clear, and focus returns to the first input

  Scenario: Resource-free isolation and restrictive CSP
    Then scripts and styles are local external files with no inline handlers
    And inline script, eval and connection probes are blocked by actual browser CSP
    And no management calls, credentials, accounts or remote requests occur
    And normal verification never rewrites retained proof
    And this model does not certify actual database synchronization or writer fencing
