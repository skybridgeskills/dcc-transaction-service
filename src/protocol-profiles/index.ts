/**
 * The protocol profile surface: named, versioned, total statements of every
 * byte-affecting choice this service makes when it talks to a wallet.
 *
 * ⚠️ **"Profile" means three different things in this codebase.** Here it is a
 * `ProtocolProfile` — a wire statement. In `src/cli/profiles/` it is a preset
 * of exchange variables for the CLI. In the interoperability test suite it is a
 * conformance profile a wallet is measured against. The type, its fields and
 * its functions are all qualified (`ProtocolProfile`, `protocolProfileName`,
 * `resolveProtocolProfile`, `PROTOCOL_PROFILES`) for exactly this reason.
 * ⚠️ Never introduce a bare `Profile` here.
 *
 * @see docs/protocol-profiles.md
 */
export {
  PROFILED_WORKFLOW_IDS,
  type EnvelopeProfileFields,
  type IssuanceProfileFields,
  type Oid4vciProfileFields,
  type Oid4vpProfileFields,
  type ProfiledWorkflowId,
  type ProtocolProfile,
  type VprProfileFields,
  type WorkflowWireProfile
} from './types.js'

export {
  PROTOCOL_PROFILE_NAME_PATTERN,
  VENDOR_PRODUCT_NAME_TOKENS,
  assertProfileNameIsNotVendorNamed,
  assertSchemaIsTotal,
  missingWireFields,
  parseProtocolProfile,
  protocolProfileSchema
} from './schema.js'

export {
  PROTOCOL_PROFILES,
  buildProtocolProfileRegistry,
  getProtocolProfile,
  protocolProfileNames
} from './registry.js'

export {
  tryResolveProtocolProfile,
  wireProfileForExchange
} from './for-exchange.js'

export {
  PROTOCOL_PROFILE_SOURCES,
  resolveProtocolProfile,
  resolveProtocolProfileName,
  type ProtocolProfileSource,
  type ResolvedProtocolProfileName
} from './resolve.js'
