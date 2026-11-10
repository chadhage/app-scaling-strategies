@U061 @zero_credit @historical_provenance
Feature: Accept exactly the retained raw or LF-canonical historical provenance
  U061 repairs the two historical U005/U006 draft-RED stable-input checks.
  The original raw artifacts, capture manifests, streams and seals remain immutable.
  A chained append-only current authority names the exact original and amended
  verifier bytes and authenticates the original recorded raw/canonical digest pairs.
  U007 completion, Edge qualification and live application are separate gates.

  Scenario: Original retained raw inputs remain accepted
    Given the actual six original U005/U006 draft-RED manifests
    And their byte-exact retained stable inputs
    When the current-authority verifier checks each input
    Then every original raw digest is accepted as raw provenance

  Scenario: Exact LF-canonical inputs are accepted without rewriting history
    Given the same original manifests and retained raw inputs
    When only CRLF pairs in a private copy become LF
    Then its exact recorded canonical digest is accepted as LF provenance
    And the loadable retained raw-only control fails that assertion before the fix
    And the same behavioral tests pass unchanged after the fix

  Scenario: Other bytes cannot borrow canonical provenance
    When an input has mixed raw/canonical newlines or a content byte changes
    Or its path or recorded digest pair is not in the sealed historical inventory
    Then the input is refused by name

  Scenario: Current authority is append-only and closed
    Given a sealed original inventory and the exact original verifier snapshots
    When an addendum supersedes exactly the two authorized verifier files
    Then the raw or canonical amended bytes pass
    But a changed base, chain link, tip, helper, manifest, snapshot or other verifier byte fails by name
    And missing, reordered, duplicate, no-op or unapproved amendments are refused

  Scenario: Fresh trees and preserved failures are checked for real
    Then the complete lifecycle namespace passes in raw, fresh LF and CRLF copies
    And the original historical failures remain failed immutable observations
    And every new RED/GREEN/evidence/authority capture is verified
    And every first-party production file affected by this piece reaches 85/85/85
    Or complete no-production-change proof makes coverage explicitly not applicable
    And only the coordinator may authorize live application, publication or acceptance
