Feature: C043 review fixes (second round): pipelining behind a refusal, a step the step service contradicts, a total answer validator
  The independent review of the first publication (kanban/C043/88fd6b086069) rejected three majors and four minors.
  This file is the specification of the fixes; C043.feature stays as published. Same scope: SYNTHETIC, LOCAL, OFFLINE,
  127.0.0.1 with an ephemeral port, Node built-ins only; nothing here validates a production runtime or calls a cloud.

  Background:
    Given the accepted C042 step service over a local journal and two fictional leases (100 and 10 units)
    And the preset service of C043 in front of it, in this process or in a separate process

  Scenario Outline: F1 A request pipelined behind a refusal never runs
    When ONE TCP write carries <refused> followed by a valid POST /v1/presets
    Then the client receives only the answers of earlier requests and the refusal, then the connection is closed
    And the lease ledger, the step journal and the preset journal are exactly what the refusal alone leaves
    Examples:
      | refused |
      | an unknown route, a wrong method, a query, an invalid key, a foreign Host, a foreign Origin, a wrong media type |
      | a URL that is too long, a GET with a body, an unsupported action, a missing preset, a declared body that is too large |
      | invalid JSON, an unknown field, a missing field, a static bound, a conflicting key, a full lease (decided after an await) |

  Scenario: F1 Requests of one connection run one after the other and a legitimate pipeline still works
    When a read, a valid mutation and another read are pipelined in one write
    Then three answers arrive in order and the second read sees the mutation

  Scenario Outline: F3 A step that the step service does not confirm is never reported as completed
    Given a preset that completed with three standing effects and then the step journal lost its tail by <damage>
    When the service restarts and the preset is inspected, run again with the same key, resumed or cancelled
    Then the answer is the typed refusal PRESET_STEP_SERVICE_DISAGREES with the honest listing of confirmed and unconfirmed steps
    And it is never COMPLETED, the effects listed are exactly the confirmed ones, and the discarded step-journal tail is reported
    And only the recovery controls that are really executable are offered
    Examples:
      | damage |
      | a flipped final newline |
      | a cut at a record boundary |

  Scenario: F4 A tampered answer is rejected, never partially shown
    When an answer carries a detail path outside the closed vocabulary, a null step, an inherited step status or a null usage
    Then the validator answers with a typed problem and never throws
    And the page shows REJECTED and prints none of the tampered text
