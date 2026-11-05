targetScope = 'subscription'

@description('Trusted GitHub owner/repository. Protect both named environments before deploying this bootstrap.')
param repository string
param location string = 'centralus'

resource identityGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'app-scaling-demo-identities'
  location: location
  tags: { purpose: 'app-scaling-strategies-identities', repository: repository }
}

module identities './github-principals.bicep' = {
  name: 'github-identities'
  scope: identityGroup
  params: { repository: repository, location: location }
}

resource runnerContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, repository, 'demo-runner-contributor')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
    principalId: identities.outputs.runnerPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource runnerBlobRoleDelegation 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, repository, 'demo-runner-blob-delegation')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f58310d9-a9f6-439a-9e8d-f62e7b41a168')
    principalId: identities.outputs.runnerPrincipalId
    principalType: 'ServicePrincipal'
    conditionVersion: '2.0'
    condition: '''
      (
        (!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'}))
        OR
        (
          @Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {ba92f5b4-2d11-453d-a403-e96b0029c9fe}
          AND
          @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
        )
      )
      AND
      (
        (!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'}))
        OR
        (
          @Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {ba92f5b4-2d11-453d-a403-e96b0029c9fe}
          AND
          @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}
        )
      )
      '''
  }
}

resource cleanupRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(subscription().id, repository, 'demo-cleanup-role')
  properties: {
    roleName: 'App scaling demo cleanup (${repository})'
    description: 'Read/delete resource groups and cancel/remove deployment records. No deployment, identity, data-plane, or role-assignment write permissions.'
    type: 'CustomRole'
    assignableScopes: [subscription().id]
    permissions: [
      {
        actions: [
          'Microsoft.Resources/subscriptions/read'
          'Microsoft.Resources/subscriptions/resourceGroups/read'
          'Microsoft.Resources/subscriptions/resourceGroups/delete'
          'Microsoft.Resources/deployments/read'
          'Microsoft.Resources/deployments/cancel/action'
          'Microsoft.Resources/deployments/delete'
        ]
        notActions: []
        dataActions: []
        notDataActions: []
      }
    ]
  }
}

resource cleanupAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, repository, 'demo-cleanup-assignment')
  properties: {
    roleDefinitionId: cleanupRole.id
    principalId: identities.outputs.cleanupPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output subscriptionId string = subscription().subscriptionId
output tenantId string = tenant().tenantId
output runnerClientId string = identities.outputs.runnerClientId
output cleanupClientId string = identities.outputs.cleanupClientId
