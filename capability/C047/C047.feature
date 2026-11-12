Feature: Original C047 candidate preview authorization
  The local offline candidate uses the accepted C022 server-side one-tenant session
  and its project.create member/admin permission, never C009 public read permission.
  No identity provider, cloud action, live mount, publication or Kano credit is authorized.

  Scenario: Every actually mounted candidate representation has a real positive
    Given a valid accepted C022 tenant session with current project.create permission
    When the user requests each candidate path, asset and alias from the actual route table
    Then the candidate is served from only that session's tenant
    And a viewer, anonymous, missing, forged or ended session receives no candidate bytes

  Scenario: Direct protocols and methods cannot bypass the gate
    When a candidate is addressed directly through GET, HEAD, unsupported methods,
      HTTP/1.0, absolute-form, Expect, pipeline, CONNECT, Upgrade or h2c
    Then only the explicitly supported authorized GET reaches candidate serving
    And every refusal leaves tenant resources and session state unchanged

  Scenario: Authority is current at the serving and effect boundary
    Given a request that passed its initial permission check
    When its session expires, logs out, is revoked or its membership is demoted
    Then the actual serving or project.create effect rechecks accepted authority
    And it refuses without candidate data or a business effect
    And a subsequent re-upgrade restores the same still-active session's permission

  Scenario: Session bootstrap retains its intended non-candidate semantics
    Given the accepted in-process issueTicket stand-in
    When a valid ticket is posted to the login route with an optional anonymous session
    Then the accepted C022 login creates a new one-tenant session
    And anonymous bootstrap does not require preview permission
    And no HTTP endpoint mints tickets or accepts client identity claims
