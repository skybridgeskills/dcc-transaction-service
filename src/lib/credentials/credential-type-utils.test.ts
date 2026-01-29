import {
  getCredentialTypeName,
  detectCredentialType,
  getCredentialDisplayName
} from './credential-type-utils.js'

describe('credential-type-utils', () => {
  describe('getCredentialTypeName', () => {
    it('should return human-readable name for OpenBadgeCredential', () => {
      expect(getCredentialTypeName('OpenBadgeCredential')).toBe('Open Badge')
    })

    it('should return human-readable name for AchievementCredential', () => {
      expect(getCredentialTypeName('AchievementCredential')).toBe('Open Badge')
    })

    it('should return original type for unknown types', () => {
      expect(getCredentialTypeName('UnknownType')).toBe('UnknownType')
    })
  })

  describe('detectCredentialType', () => {
    it('should detect OpenBadgeCredential from credential object', () => {
      const credential = {
        type: ['VerifiableCredential', 'OpenBadgeCredential']
      }
      expect(detectCredentialType(credential)).toBe('OpenBadgeCredential')
    })

    it('should detect AchievementCredential from credential object', () => {
      const credential = {
        type: ['VerifiableCredential', 'AchievementCredential']
      }
      expect(detectCredentialType(credential)).toBe('AchievementCredential')
    })

    it('should prefer OpenBadgeCredential over AchievementCredential', () => {
      const credential = {
        type: [
          'VerifiableCredential',
          'OpenBadgeCredential',
          'AchievementCredential'
        ]
      }
      expect(detectCredentialType(credential)).toBe('OpenBadgeCredential')
    })

    it('should detect credential type from JSON string', () => {
      const credential = JSON.stringify({
        type: ['VerifiableCredential', 'OpenBadgeCredential']
      })
      expect(detectCredentialType(credential)).toBe('OpenBadgeCredential')
    })

    it('should return Unknown for credential without type array', () => {
      const credential = { type: 'VerifiableCredential' }
      expect(detectCredentialType(credential)).toBe('Unknown')
    })

    it('should return Unknown for credential without type field', () => {
      const credential = {}
      expect(detectCredentialType(credential)).toBe('Unknown')
    })

    it('should return Unknown for credential with only VerifiableCredential', () => {
      const credential = {
        type: ['VerifiableCredential']
      }
      expect(detectCredentialType(credential)).toBe('Unknown')
    })

    it('should return Unknown for invalid JSON string', () => {
      const credential = 'invalid json'
      expect(detectCredentialType(credential)).toBe('Unknown')
    })

    it('should return Unknown for null', () => {
      expect(detectCredentialType(null)).toBe('Unknown')
    })

    it('should return Unknown for undefined', () => {
      expect(detectCredentialType(undefined)).toBe('Unknown')
    })
  })

  describe('getCredentialDisplayName', () => {
    it('should return human-readable name for OpenBadgeCredential', () => {
      const credential = {
        type: ['VerifiableCredential', 'OpenBadgeCredential']
      }
      expect(getCredentialDisplayName(credential)).toBe('Open Badge')
    })

    it('should return human-readable name for AchievementCredential', () => {
      const credential = {
        type: ['VerifiableCredential', 'AchievementCredential']
      }
      expect(getCredentialDisplayName(credential)).toBe('Open Badge')
    })

    it('should return Unknown for unsupported credential types', () => {
      const credential = {
        type: ['VerifiableCredential', 'CustomCredential']
      }
      expect(getCredentialDisplayName(credential)).toBe('Unknown')
    })

    it('should handle JSON string credentials', () => {
      const credential = JSON.stringify({
        type: ['VerifiableCredential', 'OpenBadgeCredential']
      })
      expect(getCredentialDisplayName(credential)).toBe('Open Badge')
    })
  })
})
