@description('Only the plan created for this isolated experiment may be supplied.')
param planName string
param location string = resourceGroup().location

@allowed([1, 2])
param capacity int

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: planName
  location: location
  kind: 'linux'
  sku: { name: 'P1v3', tier: 'PremiumV3', capacity: capacity }
  properties: { reserved: true }
}
