export const getLcwProtocol = (exchange: App.ExchangeDetailBase) => {
  const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`
  if (exchange.workflowId == 'verify') {
    return `https://lcw.app/request.html?request=${encodeURIComponent(
      JSON.stringify({
        credentialRequestOrigin: exchange.variables.exchangeHost,
        protocols: {
          vcapi: serviceEndpoint
        }
      })
    )}`
  }

  // didAuth and claim workflows can cause the wallet to direct-post to the service endpoint
  return `https://lcw.app/request.html?issuer=issuer.example.com&auth_type=bearer&challenge=${
    exchange.variables.challenge
  }&vc_request_url=${encodeURIComponent(serviceEndpoint)}`
}
