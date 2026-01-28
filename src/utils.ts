import * as https from 'https'
import axios from 'axios'
import { z } from 'zod'

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

/**
 * Converts Zod validation errors to VCALM ProblemDetails format
 */
export function zodErrorToProblemDetails(zodError: z.ZodError): App.ProblemDetails[] {
  return zodError.errors.map((err) => {
    const problemDetail: App.ProblemDetails = {
      title: err.message
    }
    
    // Include path information in detail if available
    if (err.path && err.path.length > 0) {
      problemDetail.detail = `Path: ${err.path.join('.')}`
    }
    
    return problemDetail
  })
}
