/**
 * Extract the holder DID from a Verifiable Presentation.
 *
 * Handles both the string form (`holder: "did:..."`) and the object form
 * (`holder: { id: "did:..." }`). Returns `undefined` when no holder DID is
 * present. Callers are responsible for unwrapping any VC-API
 * `{ verifiablePresentation }` envelope before passing the inner VP here.
 */
export const extractHolderDid = (
  vp: Record<string, unknown>
): string | undefined => {
  const holder = (vp as { holder?: unknown }).holder
  if (typeof holder === 'string') return holder
  if (holder && typeof holder === 'object') {
    const id = (holder as { id?: unknown }).id
    if (typeof id === 'string') return id
  }
  return undefined
}
