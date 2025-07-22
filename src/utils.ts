import * as https from 'https'
import axios from 'axios'

export const callService = async (
  endpoint: string,
  body: Record<string, unknown>
) => {
  // We're calling VPC-internal services over HTTP only.
  const agent = new https.Agent({
    rejectUnauthorized: false
  })
  const { data } = await axios.post(endpoint, body, { httpsAgent: agent })
  return data
}

export function arrayOf<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}
