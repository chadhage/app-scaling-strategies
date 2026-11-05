param location string
param repository string

resource runner 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'app-scaling-demo-runner'
  location: location
}

resource cleanup 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'app-scaling-demo-cleanup'
  location: location
}

resource runnerFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: runner
  name: 'github-azure-demo'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${repository}:environment:azure-demo'
    audiences: ['api://AzureADTokenExchange']
  }
}

resource cleanupFederation 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: cleanup
  name: 'github-azure-demo-cleanup'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${repository}:environment:azure-demo-cleanup'
    audiences: ['api://AzureADTokenExchange']
  }
}

output runnerPrincipalId string = runner.properties.principalId
output runnerClientId string = runner.properties.clientId
output cleanupPrincipalId string = cleanup.properties.principalId
output cleanupClientId string = cleanup.properties.clientId
