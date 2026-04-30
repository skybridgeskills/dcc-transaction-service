import { QRCodeSVG } from 'qrcode.react'
import { wallets, getWallet } from '../lib/wallets/index.js'
import type { ProtocolId } from '../lib/wallets/wallet-schema.js'

interface WalletInteractionProps {
  selectedId: string
  protocols: Record<string, string>
}

export function WalletInteraction({
  selectedId,
  protocols
}: WalletInteractionProps) {
  const vcapiUrl = protocols.vcapi
  if (!vcapiUrl) {
    return <p>No vcapi protocol available for this exchange.</p>
  }

  const wallet = getWallet(selectedId)

  let interactionUrl: string
  if (wallet) {
    if (selectedId === 'lcw' && protocols.lcw) {
      interactionUrl = protocols.lcw
    } else {
      const protocolId = Object.keys(wallet.protocols).find(
        (p) => protocols[p]
      ) as ProtocolId | undefined
      if (!protocolId) {
        return <p>This wallet does not support any available protocol.</p>
      }
      interactionUrl = wallet.protocols[protocolId]!.getInteractionUrl(
        protocols[protocolId]
      )
    }
  } else {
    interactionUrl = protocols[selectedId] ?? vcapiUrl
  }

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          display: 'inline-block',
          padding: '16px',
          background: '#fff',
          borderRadius: '8px'
        }}
      >
        <QRCodeSVG value={interactionUrl} size={200} />
      </div>
      <div style={{ marginTop: '16px' }}>
        <a
          href={interactionUrl}
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            background: '#2563eb',
            color: '#fff',
            borderRadius: '6px',
            textDecoration: 'none',
            fontWeight: 500
          }}
        >
          Open in {wallet?.name ?? 'Wallet'}
        </a>
      </div>
    </div>
  )
}
