import type { Meta, StoryObj } from '@storybook/react'
import { WalletInteraction } from './WalletInteraction.js'
import { presetViews } from './preset-model.js'
import {
  DEFAULT_PROFILE,
  DROPPED_PIN,
  JWT_PROFILE,
  PRESETS
} from './preset-fixtures.js'
import type { LaunchPreset } from './preset-model.js'

const views = presetViews(PRESETS)
const viewOf = (id: string) => views.find((v) => v.preset.id === id)!

const byValue: LaunchPreset = {
  id: 'OID4VP:by-value',
  payloadId: 'OID4VP',
  protocolProfileName: 'oid4vp-1.0-by-value-dcql-redirect-uri',
  isDefault: true,
  axes: [],
  productIds: [],
  payload:
    'openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fexample.com%2Fworkflows' +
    '%2Fverify%2Fexchanges%2Ftest-123%2Fopenid4vp%2Fresponse' +
    '&response_type=vp_token&response_mode=direct_post&nonce=abc123' +
    '&state=xyz789&dcql_query=' +
    encodeURIComponent(
      JSON.stringify({ credentials: [{ id: 'c', format: 'ldp_vc' }] })
    ) +
    '&client_metadata=' +
    encodeURIComponent(
      JSON.stringify({
        vp_formats: { ldp_vp: { proof_type: ['DataIntegrityProof'] } }
      })
    )
}

const meta: Meta<typeof WalletInteraction> = {
  title: 'WalletInteraction',
  component: WalletInteraction,
  parameters: { layout: 'centered' }
}

export default meta
type Story = StoryObj<typeof WalletInteraction>

export const InteractionUrl: Story = {
  args: { view: viewOf('iu'), advanced: false, activeProfileName: DEFAULT_PROFILE }
}

export const LCW: Story = {
  args: { view: viewOf('lcw'), advanced: false, activeProfileName: DEFAULT_PROFILE }
}

export const ASUPocket: Story = {
  args: { view: viewOf('asu-pocket'), advanced: false, activeProfileName: DEFAULT_PROFILE }
}

export const MySkillsPocket: Story = {
  args: { view: viewOf('my-skills-pocket'), advanced: false, activeProfileName: DEFAULT_PROFILE }
}

export const NegativeControl: Story = {
  args: { view: viewOf('vcapi'), advanced: false, activeProfileName: DEFAULT_PROFILE }
}

/*
The two interaction methods a pinned test case has to tell apart. The interaction URL above is
`https`; these are `openid4vp`, and the delivery arm is the second thing that
separates them — by-value removes the `request_uri` GET, which is the only wire
evidence a failed present produces on our side. ⚠️ Both are read off the payload
string on screen, not off a derived caption.
*/
export const Oid4vpByReference: Story = {
  args: { view: viewOf('OID4VP'), advanced: false, activeProfileName: DEFAULT_PROFILE }
}

export const Oid4vpByValue: Story = {
  args: { view: presetViews([byValue])[0]!, advanced: false, activeProfileName: DEFAULT_PROFILE }
}

/** ⚠️ The operator's view: the decode block, beside the QR it decodes. */
export const WithDecode: Story = {
  args: { view: viewOf('OID4VP'), advanced: true, activeProfileName: DEFAULT_PROFILE }
}

/** ⚠️ A pinned construction, decoded out of the bytes rather than off the row. */
export const PinnedAndDecoded: Story = {
  args: { view: viewOf(`OID4VP:${JWT_PROFILE}`), advanced: true, activeProfileName: DEFAULT_PROFILE }
}

/**
 * ⚠️ **The QR/preset mismatch — a DROPPED pin.** The row names a construction
 * the payload does not carry, which the naive symmetric check cannot see.
 * Red is reserved for exactly this.
 */
export const QrPresetMismatch: Story = {
  args: { view: presetViews([DROPPED_PIN])[0]!, advanced: true, activeProfileName: DEFAULT_PROFILE }
}
