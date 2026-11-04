Feature: C030 distinguishes one intended business effect from delivery retries
  # Original D / P0 / H006; parents H006/H012; independent Done gates C023/C029.
  Background:
    Given the unchanged accepted C023 ledger and C029 evaluator
    And "Training rehearsal - synthetic data - not a live Azure result"
    And C023 assumes an atomic application/deduplication pair in a PURE event log
    And no queue, database, external business receipt or C033 client association exists

  Scenario: Delivery counts cannot substitute for application observations
    Given three intended effects and three delivery attempts
    But no required application observations
    When the effect detector inspects them
    Then the decision is HOLD and confirmed applications are zero
    And missing observations are not confirmed absences

  Scenario: A valid C023 replay is not a duplicate application
    Given one modeled application before the checkpoint and a resumed delivery
    When the unchanged ledger suppresses the retained effect key
    Then there are three modeled applications and four deliveries
    And the first incomplete original remains in the denominator
    And there is no external exactly-once claim

  Scenario: Negative controls are explicitly fictional and unbound
    Given a closed fictional observation of two application identities for one effect
    Then a duplicate application fails even after a positive retry
    Given a fictional confirmed absence at the original terminal
    Then it fails and is not repaired by a later application
    But an absent observation without confirmed absence remains UNKNOWN

  Scenario: Unknown acknowledgement remains unknown
    Given a C023 original unknown acknowledgement
    When hypothetical committed reconciliation or absent-then-retry is inspected
    Then the original and the affected work retain unknown upper bounds
    And hypothetical applications are separate from confirmed modeled applications

  Scenario: Historical clients have no effect receipts or association
    Given C029's seven saved historical originals
    Then all seven effect outcomes are UNKNOWN with a denominator of seven
    And C029's own two PASS, two FAIL and three UNKNOWN outcomes are retained separately
    And no C023 modeled effect is joined to those clients

  Scenario: Complete identities, strict data and immutable observations
    Given a complete closed plan of job, work version, profile and effect keys
    Then missing, extra, repeated or mismatched identities reject
    And duplicate JSON keys, getters, nonfinite numbers and sparse arrays reject
    And source copies cannot override eligibility, verdicts or provenance
    And rejected copies never replace the selected immutable source
    And unsupported remains UNSUPPORTED rather than PASS

  Scenario: Static keyboard inspection retains failures
    When the learner inspects, compares, copies, edits invalid JSON and resets
    Then the actual signed Edge DOM exposes exact counts and errors
    And reset returns focus without deleting original or failed history
    And sixteen retained operations are bounded by refusal rather than eviction
    And CSP blocks connections, inline execution and forms
    And the unchanged isolated browser helper is closed in finally
