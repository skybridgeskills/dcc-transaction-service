import type { ProfileVariables } from '../../types.js'

const profile: ProfileVariables = {
  tenantName: 'default',
  vprContext: ['https://www.w3.org/ns/credentials/v2'],
  vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
  vprClaims: []
}

export default profile
