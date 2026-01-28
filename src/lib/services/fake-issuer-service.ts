/**
 * FakeIssuerService - signs credentials locally using did:key
 * Used for testing and development when signing service is not available
 */

// @ts-nocheck - digitalbazaar libraries don't have complete type definitions
import { issue } from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
// Note: We construct did:key directly from multibase format: did:key:<multibase>
// The @digitalbazaar/did-method-key package is available if needed for other operations
import { documentLoader } from '../../documentLoader.js'
import type { IssuerService, SignCredentialOptions } from './issuer-service.js'
import crypto from 'crypto'

export class FakeIssuerService implements IssuerService {
  private defaultKey: Ed25519VerificationKey2020 | null = null
  private defaultSuite: Ed25519Signature2020 | null = null
  private defaultDid: string | null = null

  constructor(issuerDid?: string, issuerKeySeed?: Uint8Array) {
    if (issuerDid && issuerKeySeed) {
      this.initializeKey(issuerDid, issuerKeySeed)
    }
    // Otherwise, lazy initialization on first use
  }

  private async initializeKey(
    issuerDid?: string,
    issuerKeySeed?: Uint8Array
  ): Promise<void> {
    if (this.defaultKey && this.defaultSuite) {
      return // Already initialized
    }

    const seed = issuerKeySeed ?? crypto.randomBytes(32)

    // Generate key first
    this.defaultKey = await Ed25519VerificationKey2020.generate({
      seed
    })

    // Determine the controller DID
    let controller: string
    if (issuerDid) {
      // Use provided DID
      controller = issuerDid
    } else {
      // Generate did:key from the public key
      const keyDoc = await this.defaultKey.export({ publicKey: true })

      // The did:key format is: did:key:<multibase-encoded-public-key>
      // The keyDoc.publicKeyMultibase already has the multibase format (starts with 'z')
      if (keyDoc.publicKeyMultibase) {
        controller = `did:key:${keyDoc.publicKeyMultibase}`
      } else if (keyDoc.id && String(keyDoc.id).startsWith('did:key:')) {
        // If keyDoc.id is already a did:key, use it
        controller = String(keyDoc.id).split('#')[0]
      } else if (
        this.defaultKey.id &&
        String(this.defaultKey.id).startsWith('did:key:')
      ) {
        // If key.id is already a did:key, use it
        controller = String(this.defaultKey.id).split('#')[0]
      } else {
        throw new Error(
          'Failed to generate did:key from public key. Key document: ' +
            JSON.stringify(keyDoc, null, 2)
        )
      }
    }

    // Set the controller on the key
    this.defaultKey.controller = controller

    // Set the id property on the key to match the verification method format
    // For did:key, the verification method is: did:key:<multibase>#<multibase>
    const multibasePart = controller.replace('did:key:', '')
    const verificationMethod = `${controller}#${multibasePart}`
    this.defaultKey.id = verificationMethod

    // Create suite with verificationMethod
    this.defaultSuite = new Ed25519Signature2020({
      key: this.defaultKey,
      verificationMethod
    })
    this.defaultDid = controller
  }

  async signCredential(
    credential: Record<string, unknown>,
    tenantName: string,
    options?: SignCredentialOptions
  ): Promise<Record<string, unknown>> {
    await this.initializeKey()

    // Use provided options or defaults
    let key = this.defaultKey!
    let suite = this.defaultSuite!
    let issuerDid = this.defaultDid!

    if (options?.issuerDid || options?.issuerKeySeed) {
      const seed = options.issuerKeySeed
        ? new Uint8Array(Buffer.from(options.issuerKeySeed, 'hex'))
        : crypto.randomBytes(32)

      // Generate key
      key = await Ed25519VerificationKey2020.generate({
        seed
      })

      // Determine the controller DID
      let controller: string
      if (options.issuerDid) {
        controller = options.issuerDid
      } else {
        // Generate did:key from the public key
        const keyDoc = await key.export({ publicKey: true })

        // The did:key format is: did:key:<multibase-encoded-public-key>
        // The keyDoc.publicKeyMultibase already has the multibase format (starts with 'z')
        if (keyDoc.publicKeyMultibase) {
          controller = `did:key:${keyDoc.publicKeyMultibase}`
        } else if (keyDoc.id && String(keyDoc.id).startsWith('did:key:')) {
          // If keyDoc.id is already a did:key, use it
          controller = String(keyDoc.id).split('#')[0]
        } else if (key.id && String(key.id).startsWith('did:key:')) {
          // If key.id is already a did:key, use it
          controller = String(key.id).split('#')[0]
        } else {
          throw new Error(
            'Failed to generate did:key from public key. Key document: ' +
              JSON.stringify(keyDoc, null, 2)
          )
        }
      }

      // Set the controller on the key
      key.controller = controller

      // Set the id property on the key to match the verification method format
      // For did:key, the verification method is: did:key:<multibase>#<multibase>
      const multibasePart = controller.replace('did:key:', '')
      const verificationMethod = `${controller}#${multibasePart}`
      key.id = verificationMethod

      suite = new Ed25519Signature2020({
        key,
        verificationMethod
      })
      issuerDid = controller
    }

    // Ensure credential has issuer set
    // If credential already has an issuer, use it (but ensure it matches our signing key)
    // Otherwise, set it to our issuerDid
    if (!credential.issuer) {
      credential.issuer = issuerDid
    } else if (
      typeof credential.issuer === 'object' &&
      credential.issuer !== null
    ) {
      // If issuer is an object, ensure it has an id that matches our signing key
      const issuerObj = credential.issuer as Record<string, unknown>
      if (issuerObj.id && typeof issuerObj.id === 'string') {
        // Use the issuer's id - but we need to ensure we're signing with a matching key
        // For now, update it to match our signing key to ensure the proof is valid
        issuerObj.id = issuerDid
      } else {
        issuerObj.id = issuerDid
      }
    } else {
      // If issuer is a string, ensure it matches our signing key
      credential.issuer = issuerDid
    }

    // Sign the credential
    const signedCredential = await issue({
      credential,
      suite,
      documentLoader
    })

    return signedCredential as Record<string, unknown>
  }
}
