@A-S006 @S006 @D-S006 @LP-PROFILE @synthetic
Feature: Preview admission requires identity evidence, not knowledge of a URL
  This portable SOURCE lesson compares two synthetic clients. It is not an
  identity system, B-S006 native proof, or completion of D-S006.

  Background:
    Given the banner "Training rehearsal - synthetic data - not a live Azure result"
    And an independent GA session "ga-session-001" attributed to "synthetic-ga-001" on v1
    And a separate preview probe session "preview-session-001"
    And all paths, identities, status codes, and callback evidence are synthetic
    And no network, authentication API, credentials, or management calls are available

  Scenario: Approved identity joins preview without changing GA attribution
    Given identity "approved" has explicit synthetic preview approval
    And policy "enforced" checks identity at each candidate entry
    And callback evidence "bound" matches the preview session and allowed local return path
    When the learner runs route "join-preview"
    Then the preview probe reaches v2 with synthetic status 200 and decision "allowed"
    And the trace stages are:
      | stage             |
      | ga.baseline       |
      | preview.request   |
      | identity.evidence |
      | login.request     |
      | callback.validate |
      | preview.authorize |
      | preview.serve     |
      | ga.after          |
      | cleanup.scope     |
    And login remains "/auth/login" and callback remains "/auth/callback"
    And the preview subject and session attribution survive the modeled callback
    And the GA session, subject, attribution, and v1 version are unchanged
    And the verifier passes while user impact says "preview admitted"

  Scenario Outline: Knowing an obscure direct or indirect URL does not grant preview access
    Given identity "visitor" is authenticated but lacks preview approval
    And policy "enforced" is selected with valid callback evidence
    When the learner runs route "<route>"
    Then the decision is "forbidden" with synthetic status 403
    And no candidate handler serves v2
    And the verifier passes for the expected denial
    And user impact records "preview blocked" rather than a successful preview visit
    And the independent GA client remains unchanged on v1
    Examples:
      | route               |
      | join-preview        |
      | direct-ui           |
      | direct-api          |
      | indirect-navigation |
      | indirect-callback   |
      | indirect-gateway    |

  Scenario Outline: Missing or unrecognized identity evidence fails closed
    Given identity "<identity>" has no recognized approval evidence
    And policy "enforced" is selected
    When any candidate route is probed
    Then the decision is "unknown" with synthetic status 401
    And the unknown result is retained, not relabeled as an authorized visit
    And v2 is not reached
    And the verifier passes for fail-closed behavior
    Examples:
      | identity     |
      | missing      |
      | unrecognized |
      | unexpected   |

  Scenario Outline: Ordinary navigation does not opt a client into preview
    Given identity "<identity>" and either available policy
    When the learner runs route "ordinary"
    Then navigation stays on v1 with decision "ga"
    And there is no candidate admission or simulated login redirect
    And GA user attribution remains unchanged
    Examples:
      | identity     |
      | approved     |
      | visitor      |
      | missing      |
      | unrecognized |

  Scenario Outline: Broken login or callback evidence cannot authorize a preview
    Given identity "approved" and policy "enforced"
    And callback evidence "<callback>"
    When the learner runs "join-preview" or "indirect-callback"
    Then the decision is "callback-rejected" with synthetic status 400
    And no candidate handler serves v2
    And the callback failure remains visible separately from user impact and cleanup
    And GA attribution remains unchanged
    Examples:
      | callback        |
      | missing         |
      | mismatch        |
      | external-return |

  Scenario: The obscure-URL-only counterexample is detected, not celebrated
    Given identity "visitor" and policy "obscurity-only"
    And automatic production routing is still 0 percent candidate
    When the learner probes a direct or indirect candidate path
    Then the broken model admits the unauthorized visitor to v2
    And the independent verifier fails the authorization assertion
    And user impact explicitly records "unauthorized preview exposure"
    And ordinary GA navigation still remains on v1
    And the failed verifier and exposure remain in the bounded probe history

  Scenario: Unknown configuration is rejected instead of silently granting admission
    Given an unrecognized route, policy, or required callback-evidence value
    When a synthetic probe runs
    Then it is rejected without reaching v2
    And the verifier checks that fail-closed outcome

  Scenario: An independent verifier detects corrupted evidence
    Given an otherwise valid approved preview run
    When its GA attribution, preview subject, route decision, or required trace is changed
    Then the verifier fails rather than trusting a producer success label
    And user-impact reporting remains separate from the verifier verdict

  Scenario: The lesson is an offline keyboard-operable rehearsal with explicit limits
    Given the self-contained file-browser lesson is open
    When the learner selects identities and routes, submits by keyboard, and compares routes
    Then live status, the trace, per-assertion results, and separate client summaries update
    And negative and unknown outcomes remain visible in history and the comparison
    When the learner explicitly resets the rehearsal
    Then in-tab results and history are cleared without touching external resources
    And cleanup reports no resources, cookies, or persistent application state created
    And IaC is N/A because SOURCE needs no Azure resources
    And C001 runtime/auth/hosting and separate scaffold/deploy approvals remain ungranted
    And B-S006, the source parent, native authorization, and reliability remain unproven
