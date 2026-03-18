import type { ZodIssue } from 'zod'

const VC_DM_BASE_URL = 'https://www.w3.org/TR/vc-data-model'

// --- Spec-defined codes ---

export const PARSING_ERROR = 'PARSING_ERROR' as const
export const MALFORMED_VALUE_ERROR = 'MALFORMED_VALUE_ERROR' as const
export const CRYPTOGRAPHIC_SECURITY_ERROR =
  'CRYPTOGRAPHIC_SECURITY_ERROR' as const
export const RANGE_ERROR = 'RANGE_ERROR' as const

// --- Custom codes (not in spec) ---

// Add custom codes here as needed, e.g.:
// export const MISSING_HOLDER_ERROR = 'MISSING_HOLDER_ERROR' as const

export type ProblemDetailCode =
  | typeof PARSING_ERROR
  | typeof MALFORMED_VALUE_ERROR
  | typeof CRYPTOGRAPHIC_SECURITY_ERROR
  | typeof RANGE_ERROR

export type ProblemDetail = {
  type: string
  status: number
  title: string
  detail: string
}

export type ProblemDetailResponse = {
  message: string
  problemDetails: ProblemDetail[]
}

function codeUrl(code: string): string {
  return `${VC_DM_BASE_URL}#${code}`
}

function formatPath(path: (string | number)[]): string {
  if (path.length === 0) return ''
  return path
    .map((p) => (typeof p === 'number' ? `[${p}]` : p))
    .join('.')
    .replace(/\.\[/g, '[')
}

function zodIssueToCode(issue: ZodIssue): ProblemDetailCode {
  switch (issue.code) {
    case 'invalid_type':
      return MALFORMED_VALUE_ERROR
    case 'too_small':
    case 'too_big':
      return RANGE_ERROR
    default:
      return PARSING_ERROR
  }
}

/** Converts Zod validation issues into VC Data Model problem detail objects. */
export function zodProblemDetails(
  issues: ZodIssue[],
  prefix?: string
): ProblemDetail[] {
  return issues.map((issue) => {
    const code = zodIssueToCode(issue)
    const path = formatPath(issue.path)
    const location = prefix && path ? `${prefix}.${path}` : prefix || path
    const detail = location ? `at ${location}: ${issue.message}` : issue.message

    return {
      type: codeUrl(code),
      status: 400,
      title: code,
      detail
    }
  })
}

/** Builds a structured error response with message and problem details. */
export function problemDetailResponse(
  message: string,
  details: ProblemDetail[]
): ProblemDetailResponse {
  return { message, problemDetails: details }
}
