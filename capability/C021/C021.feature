Feature: Explicitly rehearse one incompatible synthetic profile contract
  C021 is one frozen S unit of H005, dependent on accepted C020.
  C020 v1 and v2 remain implementations of getProfile/1, not API versions.
  This local rehearsal supplies no native, identity, store, or production proof.

  Scenario: Preserve the accepted compatible baseline without changing its consumers
    Given the real C020 getProfileV1 and getProfileV2 exports and immutable catalog
    When the unchanged C020 oldConsumer reads either implementation for either profile
    Then both API contracts remain getProfile/1 and all business fields are identical
    And their implementation versions and local fixture stamps remain distinct

  Scenario: Introduce exactly one deliberately incompatible contract
    Given a verified C020 response and explicit implementation and profile context
    When C021 produces synthetic getProfile/2 with renamed and nested person fields
    Then the unchanged C020 oldConsumer rejects it with CONTRACT_MISMATCH
    And the explicit new consumer reads the same ID, name, email, locale, theme, and ordered topics
    And the new consumer rejects unadapted getProfile/1 instead of guessing its version

  Scenario: Use an explicit directional adapter rather than silently accepting a break
    Given a valid synthetic getProfile/2 response
    When the getProfile/2-to-getProfile/1 adapter is explicitly invoked
    Then the unchanged oldConsumer reads every original semantic field
    And the adapted envelope names its adapter and source contract and exact source fixture stamp
    And it cannot masquerade as an original C020 observation
    And an already adapted response is rejected on a second adaptation

  Scenario: Fail closed on malformed, unknown, and unsupported input
    Given explicit expected implementation and profile context
    When input has an unknown contract, implementation, profile, forged provenance, or changed data
    Or required, extra, malformed, sparse, cyclic, inherited, accessor, or symbol fields
    Then no safe transition is emitted and the rejection has an explicit code
    And JSON parsing has a bounded size and never supplies a healthy default

  Scenario: Preserve immutable inputs and independent outputs
    When either profile is transformed, consumed, and adapted repeatedly
    Then all returned records and collections are deeply frozen and independently allocated
    And source responses, C020 source bytes, catalog, and stamps remain unchanged
    And editing a JSON copy cannot affect a subsequent rehearsal

  Scenario: Conduct the portable rehearsal from a local file
    Given the real C020 contract and inspector scripts loaded unchanged
    And the browser uses the bundled catalog, not a live implementation or HTTP observation
    When the conductor uses Tab and Enter to run either profile and implementation
    Then readable actual old/new consumer outcomes distinguish RAW BREAKING from ADAPTED SAFE
    And changing context, malformed candidates, and reset clear stale successful results
    And missing dependencies fail closed, and the actual browser enforces script and connection CSP
    And isolated headless Edge closes in finally without an integrated foreground lease

  Scenario: Preserve proof and scope
    Given BDD, a loadable stub, and executed behavioral assertion failures precede implementation
    Then IaC is N/A because no resource or deployment is introduced
    And ordinary tests never rewrite committed proof
    And browser proof capture requires CAPTURE_BROWSER_EVIDENCE=1
    And RED snapshots are not automatically discovered as normal tests
