/**
 * FakeWalletService - signs presentations locally using did:key
 * Used for testing when real wallets are not available
 */

// @ts-nocheck - digitalbazaar libraries don't have complete type definitions
import { signPresentation, createPresentation } from '@digitalbazaar/vc'
import { DataIntegrityProof } from '@digitalbazaar/data-integrity'
import { cryptosuite as eddsaRdfc2022Cryptosuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
import { documentLoader } from '../../documentLoader.js'
import crypto from 'crypto'

export interface SignPresentationOptions {
  /**
   * Optional wallet DID/key override
   * If not provided, uses the service's default wallet DID/key
   */
  walletDid?: string
  walletKeySeed?: Uint8Array
}

export class FakeWalletService {
  private defaultKey: Ed25519VerificationKey2020 | null = null
  private defaultSuite: DataIntegrityProof | null = null
  private defaultDid: string | null = null

  constructor(walletDid?: string, walletKeySeed?: Uint8Array) {
    if (walletDid && walletKeySeed) {
      // Initialize synchronously if both provided
      this.initializeKey(walletDid, walletKeySeed).catch(() => {
        // Ignore errors - will be handled on first use
      })
    }
    // Otherwise, lazy initialization on first use (guaranteed in signPresentation)
  }

  private async initializeKey(
    walletDid?: string,
    walletKeySeed?: Uint8Array
  ): Promise<void> {
    if (this.defaultKey && this.defaultSuite) {
      return // Already initialized
    }

    const seed = walletKeySeed ?? crypto.randomBytes(32)

    // Generate key first
    this.defaultKey = await Ed25519VerificationKey2020.generate({
      seed
    })

    // Determine the controller DID
    let controller: string
    if (walletDid) {
      // Use provided DID
      controller = walletDid
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

    // Create suite with eddsa-rdfc-2022 cryptosuite
    // The suite needs a signer and verificationMethod from the key
    this.defaultSuite = new DataIntegrityProof({
      cryptosuite: eddsaRdfc2022Cryptosuite
    })
    this.defaultSuite.signer = this.defaultKey.signer()
    this.defaultSuite.verificationMethod = verificationMethod
    this.defaultDid = controller
  }

  /**
   * Signs a verifiable presentation
   * @param presentation The presentation to sign (may include verifiableCredential array)
   * @param challenge The challenge string for the presentation
   * @param options Optional signing options
   * @returns The signed verifiable presentation
   */
  async signPresentation(
    presentation: Record<string, unknown>,
    challenge: string,
    options?: SignPresentationOptions
  ): Promise<Record<string, unknown>> {
    // Ensure key is initialized - this will always create a default key if not already initialized
    await this.initializeKey()

    // Use provided options or defaults
    let key = this.defaultKey!
    let holderDid = this.defaultDid!

    if (options?.walletDid || options?.walletKeySeed) {
      const seed = options.walletKeySeed
        ? new Uint8Array(Buffer.from(options.walletKeySeed, 'hex'))
        : crypto.randomBytes(32)

      key = await Ed25519VerificationKey2020.generate({
        seed
      })

      // Determine the controller DID
      let controller: string
      if (options.walletDid) {
        controller = options.walletDid
      } else {
        // Generate did:key from the public key
        const keyDoc = await key.export({ publicKey: true })
        if (keyDoc.publicKeyMultibase) {
          controller = `did:key:${keyDoc.publicKeyMultibase}`
        } else if (keyDoc.id && String(keyDoc.id).startsWith('did:key:')) {
          controller = String(keyDoc.id).split('#')[0]
        } else if (key.id && String(key.id).startsWith('did:key:')) {
          controller = String(key.id).split('#')[0]
        } else {
          throw new Error('Failed to generate did:key from public key')
        }
      }

      // Set the controller and id on the key
      key.controller = controller
      const multibasePart = controller.replace('did:key:', '')
      const verificationMethod = `${controller}#${multibasePart}`
      key.id = verificationMethod
      holderDid = controller
    }

    // Create a fresh suite instance with the key's signer and verificationMethod
    const multibasePart = holderDid.replace('did:key:', '')
    const verificationMethod = `${holderDid}#${multibasePart}`
    const suite = new DataIntegrityProof({
      cryptosuite: eddsaRdfc2022Cryptosuite
    })
    suite.signer = key.signer()
    suite.verificationMethod = verificationMethod

    // Ensure presentation has holder set
    presentation.holder = holderDid

    // Sign the presentation
    // For DataIntegrityProof, we may need to pass the key as well
    const signedPresentation = await signPresentation({
      presentation,
      suite,
      key: key,
      challenge,
      documentLoader
    })

    return signedPresentation as Record<string, unknown>
  }

  /**
   * Creates a presentation with the given credentials and signs it
   * @param verifiableCredentials Array of verifiable credentials to include
   * @param challenge The challenge string for the presentation
   * @param options Optional signing options
   * @returns The signed verifiable presentation
   */
  async createAndSignPresentation(
    verifiableCredentials: Record<string, unknown>[],
    challenge: string,
    options?: SignPresentationOptions
  ): Promise<Record<string, unknown>> {
    // Ensure key is initialized - this will always create a default key if not already initialized
    await this.initializeKey()

    const holderDid = options?.walletDid ?? this.defaultDid!
    const presentation = createPresentation({ holder: holderDid })
    presentation.verifiableCredential = verifiableCredentials

    return this.signPresentation(presentation, challenge, options)
  }
}
