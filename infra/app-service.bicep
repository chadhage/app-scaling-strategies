param location string = resourceGroup().location

@secure()
param demoToken string

@secure()
param controlToken string

var suffix = uniqueString(resourceGroup().id)
var workloadName = 'ass-${suffix}-work'
var routerName = 'ass-${suffix}-router'
var blobDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
var settings = [
  { name: 'DEMO_STORAGE_URL', value: 'https://${state.name}.blob.${environment().suffixes.storage}' }
  { name: 'DEMO_TOKEN', value: demoToken }
  { name: 'CONTROL_TOKEN', value: controlToken }
  { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
  { name: 'ENABLE_ORYX_BUILD', value: 'false' }
  { name: 'WEBSITE_SWAP_WARMUP_PING_PATH', value: '/health/ready' }
  { name: 'WEBSITE_SWAP_WARMUP_PING_STATUSES', value: '200' }
  { name: 'WEBSITE_WARMUP_PATH', value: '/health/ready' }
  { name: 'WEBSITE_WARMUP_STATUSES', value: '200' }
]
var siteConfig = {
  linuxFxVersion: 'NODE|24-lts'
  appCommandLine: 'node server.cjs'
  alwaysOn: true
  healthCheckPath: '/health/ready'
  ftpsState: 'Disabled'
  minTlsVersion: '1.2'
  scmMinTlsVersion: '1.2'
  http20Enabled: true
  appSettings: settings
}

resource state 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'ass${suffix}'
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    accessTier: 'Hot'
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: state
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobs
  name: 'demo'
  properties: { publicAccess: 'None' }
}

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: 'ass-${suffix}-plan'
  location: location
  kind: 'linux'
  sku: { name: 'P1v3', tier: 'PremiumV3', capacity: 1 }
  properties: { reserved: true }
}

resource workload 'Microsoft.Web/sites@2024-11-01' = {
  name: workloadName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: siteConfig
  }
}

resource green 'Microsoft.Web/sites/slots@2024-11-01' = {
  parent: workload
  name: 'green'
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: siteConfig
  }
}

resource router 'Microsoft.Web/sites@2024-11-01' = {
  name: routerName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: union(siteConfig, {
      appSettings: concat(settings, [
        { name: 'BLUE_ORIGIN', value: 'https://${workload.properties.defaultHostName}' }
        { name: 'GREEN_ORIGIN', value: 'https://${green.properties.defaultHostName}' }
      ])
    })
  }
}

resource workloadAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(state.id, workload.id, blobDataContributor)
  scope: state
  properties: {
    roleDefinitionId: blobDataContributor
    principalId: workload.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource greenAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(state.id, green.id, blobDataContributor)
  scope: state
  properties: {
    roleDefinitionId: blobDataContributor
    principalId: green.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource routerAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(state.id, router.id, blobDataContributor)
  scope: state
  properties: {
    roleDefinitionId: blobDataContributor
    principalId: router.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output workloadName string = workload.name
output routerName string = router.name
output planName string = plan.name
output blueUrl string = 'https://${workload.properties.defaultHostName}'
output greenUrl string = 'https://${green.properties.defaultHostName}'
output routerUrl string = 'https://${router.properties.defaultHostName}'
