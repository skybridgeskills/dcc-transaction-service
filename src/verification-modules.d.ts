/**
 * Ambient declarations for the untyped DID-resolution and cryptosuite
 * packages the verification stack composes.
 *
 * These are all plain ESM JavaScript with no bundled `.d.ts`, and none of
 * them has a `@types/…` package. verifier-core carries the same file for the
 * same reason (`src/declarations.d.ts`). They are declared rather than
 * `any`-cast at each call site so the untypedness sits in one place where it
 * can be seen and audited.
 */
declare module '@digitalcredentials/did-io'
declare module '@digitalcredentials/did-method-key'
declare module '@digitalcredentials/did-method-web'
declare module '@digitalbazaar/did-method-jwk'
declare module '@digitalcredentials/ed25519-multikey'
declare module '@digitalbazaar/ecdsa-multikey'
declare module '@digitalcredentials/ed25519-signature-2020'
declare module '@digitalcredentials/data-integrity'
declare module '@digitalcredentials/eddsa-rdfc-2022-cryptosuite'
declare module '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite'
declare module '@digitalbazaar/ecdsa-sd-2023-cryptosuite'
declare module '@digitalbazaar/vc'
