import { chainFixes } from '../apply.js'
import { wrapBarePresentation } from './wrap-bare-presentation.js'

/**
 * Normalize a VC-API participation-message request body so downstream code
 * sees a uniform `{ verifiablePresentation, ... }` envelope shape.
 *
 * Each fix in the chain is independently feature-flagged and pure; this
 * aggregator only orders them.
 */
export const prepareVcalmParticipationMessage = (
  body: Record<string, unknown>
) => chainFixes(body, wrapBarePresentation)
