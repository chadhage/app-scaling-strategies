targetScope = 'subscription'

@description('Unique, fresh resource group derived from the Actions run, attempt, and experiment.')
@minLength(12)
@maxLength(80)
param resourceGroupName string

param location string = 'centralus'
param repository string
param runId string
param runAttempt string
param experiment string
param expiresAt string

@secure()
@minLength(32)
param demoToken string

@secure()
@minLength(32)
param controlToken string

resource demoGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: {
    purpose: 'app-scaling-strategies-demo'
    repository: repository
    runId: runId
    runAttempt: runAttempt
    experiment: experiment
    expiresAt: expiresAt
  }
}

module appService './app-service.bicep' = {
  name: 'app-service'
  scope: demoGroup
  params: {
    location: location
    demoToken: demoToken
    controlToken: controlToken
  }
}

output resourceGroupName string = demoGroup.name
output workloadName string = appService.outputs.workloadName
output routerName string = appService.outputs.routerName
output planName string = appService.outputs.planName
output blueUrl string = appService.outputs.blueUrl
output greenUrl string = appService.outputs.greenUrl
output routerUrl string = appService.outputs.routerUrl
