Feature: S128 version-separated AKS traffic selection, fictional DATA ONLY
  The source is S128 in README.md and D-S128 in .docs/wiki/backlog.md.
  A-S128 belongs to SC-S128, one frozen original S unit.
  Training rehearsal - synthetic data - not a live Azure result
  No selectors, Services, Deployments, pods, requests or identities are executed.

  Scenario: Independent selection and complete authorized journeys
    Given two fictional software builds both preserve the profile-v1 API contract
      And each build has its own fictional Deployment and two pod records
    When I inspect build-1-only GA and build-2-only preview Service selectors
      And I choose a fictional cohort-capable gateway and record route receipts
    Then GA selects only build-1 and preview selects only build-2
      And complete journeys and private-preview authorization are still unknown
    When I independently verify the two complete journeys and all private paths
    Then identity, session, cart state, payload and the original 400 ms budget hold
      And all four private paths deny GA and allow the authorized preview learner
      And only this finite synthetic rehearsal passes

  Scenario: App-only selector accidentally mixes audiences
    When the GA Service uses the allowlisted app-only selector DATA
    Then it matches both build-1 and private build-2 pods
      And selector separation fails even if a route or HTTP response looks healthy
      And empty, wrong-build and arbitrary invalid selectors cannot pass

  Scenario: Deployments do not supply weighted user routing
    When I select the deployments-only routing explanation
    Then separate Deployment records do not prove cohort or weighted routing
      And actual destinations remain unknown and the rehearsal cannot pass

  Scenario: Selection is not authorization
    Given selectors and observed cohort destinations pass
      And GA traffic selection sends zero GA journeys to private build-2
    When a fixed GA probe reaches build-2 through the preview callback path
    Then private-preview authorization fails despite correct traffic selection
      And a missing authorization observation is unknown, never a pass

  Scenario: Software version is not the API contract
    Given the preview request reaches the correct build-2 pod
    When its profile response breaks the profile-v1 contract
    Then routing can pass while the complete preview journey fails
      And HTTP 200 alone cannot hide state loss or an original-budget overrun

  Scenario: Missing evidence stays unknown
    When an observed destination or final journey completion is missing
    Then both attempted journeys remain in the denominator
      And missing evidence is neither inferred from desired routing nor a success

  Scenario: Strict commands, state, and retained history
    When a command has an unknown field, coercible value, getter or invalid token
      Or a supplied state differs from deterministic replay of its history
    Then a typed error is raised without changing state or history
    When a valid action is premature or its controls differ from the inspected choice
    Then a visible failed hold is retained with recovery guidance
    When twelve actions have been retained
    Then further actions require an explicit reset, without pruning prior evidence

  Scenario: Standalone keyboard and failure UX
    Then every control has a label and visible keyboard focus
      And alerts, live results, errors and reset are observable in the actual DOM
      And reset uses the form prototype rather than a shadowable form.reset member
      And missing model DATA fails visibly instead of manufacturing a pass
      And actual CSP blocks inline script, events, eval, connections, frames,
          images, inline styles and form navigation

  Scenario: Evidence scope and ordering
    Given a browser-loadable no-op stub
    Then the inspection assertion genuinely fails with ERR_ASSERTION before implementation
      And archived RED and original raw proof are outside test autodiscovery
      And IaC is N/A for this resource-free fixed-data lesson
      And normal verification never rewrites source or proof
      And only exact CAPTURE_BROWSER_EVIDENCE=1 deliberately adds a new capture
      And published isolated.cjs is used with awaited finally cleanup
      And native B-S128, D-S128 and production Node 24 remain unvalidated
