Feature: C037 production files carry a per-file 85/85/85 coverage proof over an enumerated file set
  Original C037 is S / P0 / LP-REPLAY, parent H007, gated by independently accepted C036.
  This addendum adds tests, evidence and proof only. It changes no production code and adds no credit.
  Training rehearsal - synthetic data - not a live Azure result

  Scenario Outline: Every enumerated production file meets the coverage bar on its own
    Given the enumerated production file <file>
    When the unchanged coverage command runs over that file alone with every non-browser C037 test
    Then line, branch and function coverage are each at least 85 percent
    And a file that no test loads counts as 0 percent whatever the command exit status says
    Examples:
      | file         |
      | routing.js   |
      | cli.cjs      |
      | page.js      |
      | authority.cjs|
      | pins.cjs     |

  Scenario: The browser page controller is loaded under DOM stubs and is never excluded from coverage
    Given the unchanged static page script and the unchanged browser script order in a fresh context
    When the controller is started, a sample is loaded, inspected, compared, shown and reset
    Then the page reports ready only after the local model opens and unavailable when it cannot
    And a second action while one is busy is ignored
    And a selection error is retained in the history list and reset never clears failures or holds
    And declared weights, UNOBSERVED policy and unknown originals are never shown as measured destinations

  Scenario Outline: The command line maps every comparison outcome to its documented exit code
    Given the closed operation <operation> and sample <sample>
    When the unchanged CLI runs it against a stubbed pin and state reader
    Then the exit code is <exit>
    And arguments outside the closed list reject with CLOSED_CLI_ARGUMENTS before any current reader
    And an error without a code is reported as LOCAL_CONTEXT_UNAVAILABLE
    Examples:
      | operation | sample              | exit |
      | compare   | fictional-match     | 0    |
      | compare   | wrong-run           | 1    |
      | compare   | fictional-unknown   | 2    |
      | compare   | fictional-skew      | 3    |
      | inspect   | historical-closed   | 2    |

  Scenario: The pinned source reader fails closed on every guard
    Given a pinned source path, a git blob batch or a state snapshot that violates one guard
    When the unchanged reader runs against recorded inputs and patched filesystem results
    Then it rejects with the guard's own code and never returns bytes or a snapshot
    And argument overrides, linked or changed sources and unaccepted prerequisites reject

  Scenario: Proof is appended, never rewritten
    Given the sealed index and the raw evidence already retained
    When the red, green, coverage, syntax and browser stages are captured again
    Then each stage lands in a unique new raw directory and an addendum index chains to the sealed index
    And IaC is N/A with no cloud, authentication, deployment, user data or spending
