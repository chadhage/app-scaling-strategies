Feature: A-S008 release-ring promotion rehearsal
  # Kano S; stable unit A-S008; parent D-S008; source S008; packet LP-RINGS.
  # SOURCE-only synthetic exercise: not B-S008 native proof or parent completion.

  Background:
    Given the internal ring has two synthetic members on frontend v2, API v2, and worker v2
    And pilot, limited, and remaining rings each have two synthetic members on all-v1 tiers
    And the internal observation window has completed with healthy synthetic journeys
    And the promotion window is open

  Scenario: Promote the next ring with compatible tiers and shared contracts
    Given pilot requests frontend v2, API v2, and worker v2
    And the shared contract supports both v1 and v2 consumers
    When I promote pilot with the healthy completed-window observation fixture
    Then only pilot advances to observed v2
    And both pilot members have actual synthetic frontend v2, API v2, worker v2 completed journeys
    And limited and remaining members stay on v1
    And the verifier passes only the synthetic assertions
    And limited becomes the next eligible ring

  Scenario: Prevent ring skipping
    When I request limited before pilot has passed its observation gate
    Then expansion is blocked before any candidate journey runs
    And pilot, limited, and remaining stay pending on v1

  Scenario: Reject incompatible mixed tier versions before expansion
    Given pilot requests frontend v2, API v1, and worker v2
    When I attempt promotion
    Then the tier-affinity assertion fails
    And no candidate routes or ring versions change

  Scenario: Reject a breaking shared contract even when target tiers match
    Given pilot requests all-v2 tiers
    And the chosen shared contract accepts only v2 consumers
    When I attempt promotion while limited and remaining still consume v1
    Then shared-contract compatibility fails before candidate routing
    And the trace names the incompatible v1 consumer rings
    And pilot does not advance

  Scenario: Unknown evidence is not a successful promotion
    When I attempt pilot with the unknown worker-observation fixture
    Then the verification verdict is UNKNOWN rather than PASS
    And the missing actual worker version remains unknown in the trace
    And user completion is unknown rather than uninterrupted success
    And limited cannot advance

  Scenario: Desired routing does not prove actual version movement
    Given the requested pilot route is all-v2
    When the stale-route fixture observes both pilot members entirely on v1
    Then completed journeys are reported separately from intended migration
    And the actual-version assertion fails
    And pilot does not advance

  Scenario: Detect observed mixed-version routing
    Given the requested pilot route is all-v2
    When the observed-tier-drift fixture records API v1 with frontend v2 and worker v2
    Then the verifier rejects actual tier affinity
    And desired all-v2 routing does not conceal the incompatible actual API

  Scenario: Observe interruption without crediting rollback as success
    When I attempt pilot with the interrupted-journey fixture
    Then one completed and one interrupted synthetic journey are reported
    And promotion is blocked
    And retained v1 routing does not erase the interrupted user's outcome

  Scenario Outline: Promotion and observation windows must be satisfied
    Given the promotion window is <window>
    When I attempt pilot with the <observation> observation fixture
    Then promotion is blocked
    And pilot does not advance

    Examples:
      | window | observation |
      | closed | healthy     |
      | open   | too-short   |

  Scenario: Advance all rings in order
    When I promote pilot, limited, and remaining in order with compatible healthy observations
    Then each promotion has its own member traces and observation gate
    And there is no next eligible ring
    And this still supplies no native Azure or 99.999% proof

  Scenario: Operate the portable exercise without a mouse
    Given I opened the lesson directly as a local file
    When I use labeled native controls with the keyboard and activate Promote selected ring
    Then the live status, ring table, synthetic trace, and assertion results change
    And Reset rehearsal restores the initial local fixture
    And verification, user impact, and cleanup remain separate
    And no network request, credential, or management operation is required

  Scenario: Preserve the evidence boundary
    Then the prominent banner reads "Training rehearsal - synthetic data - not a live Azure result"
    And IDs, objective, preconditions, actions, expected assertions, and limits are visible
    And IaC is N/A because no SOURCE-lesson Azure resource is needed
    And C001 runtime, authentication, hosting, and scaffold/deploy approval remain separate gates
    And A-S008 alone completes neither B-S008 nor D-S008
