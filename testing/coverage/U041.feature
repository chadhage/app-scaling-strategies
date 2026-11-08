Feature: U041 repairs the existing merged U009 residuals without new credit
  Historical seals, transcripts and RED subjects remain unchanged.
  Current replacements require a consecutive append-only authority amendment.

  Scenario: Two real gates name one report path
    Given both gates have written their started markers and reached an explicit barrier
    When their passing measurements complete in either order
    Then the displaced writer exits 1 with REPORT_CHANGED on stdout
    And it does not replace the surviving writer's marker or final report
    And the surviving writer exits 0 with its own fullBar report
    And an unrelated report remains byte-identical

  Scenario Outline: Equivalent JSON option spellings
    When a passing gate uses <spelling>
    Then stdout and the named file contain the same passing report
    And an empty argument is a typed usage refusal without creating a report
    And mixed repeated spellings are a typed usage refusal
    Examples:
      | spelling      |
      | --json <out>  |
      | --json=<out>  |

  Scenario: Real matcher work rather than a loop-bound formula
    Then steps increment inside the actual scan and closure iterations
    And a same-run CPU comparison measures the matcher and a naive control
    And the unchanged A08 hidden buffer-clear mutant fails by name
    And the unchanged A09 position-dependent buffer-clear mutant fails by name
    And neither a wall-clock deadline nor a timeout is a mutation kill

  Scenario: Truthful cost and optional expensive hermetic copies
    Then current documentation names the recorded 224 to 441 second reviewer scope
    And it enumerates the five files in the historical 64-run loop
    And the default run explicitly skips the expensive hermetic copy checks
    And the whole self-gate and explicit strict evidence run enable those checks
    And reported GREEN never uses U009_EVIDENCE_CAPTURE

  Scenario: Amendment authority is narrow and append-only
    Then each replacement names the exact previous and current digests
    And original bytes are retained and checked independently
    And a missing, edited, reordered or widened amendment fails by name
    And changing any unamended accepted file still fails
