import type { ZodIssue, ZodError } from 'zod'

const VC_DM_BASE_URL = 'https://www.w3.org/TR/vc-data-model'

const MAX_UNION_DEPTH = 3

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

/** Converts Zod validation issues into VC Data Model problem detail objects. */
export function zodProblemDetails(
  issues: ZodIssue[],
  prefix?: string
): ProblemDetail[] {
  return traverseIssues(issues, prefix, '', 0)
}

/** Builds a structured error response with message and problem details. */
export function problemDetailResponse(
  message: string,
  details: ProblemDetail[]
): ProblemDetailResponse {
  return { message, problemDetails: details }
}

function traverseIssues(
  issues: ZodIssue[],
  prefix: string | undefined,
  parentLabel: string,
  depth: number
): ProblemDetail[] {
  const results: ProblemDetail[] = []
  let unionCounter = 0

  for (const issue of issues) {
    if (isUnionIssue(issue)) {
      const label = parentLabel
        ? `${parentLabel}.${labelSegment(unionCounter, depth)}`
        : labelSegment(unionCounter, depth)
      unionCounter++

      const path = formatPath(issue.path)
      const location = joinLocation(prefix, path)
      const summaryDetail = location
        ? `(${label}) at ${location}: Input did not match any available schema`
        : `(${label}): Input did not match any available schema`

      results.push(makeProblemDetail(PARSING_ERROR, summaryDetail))

      if (depth < MAX_UNION_DEPTH) {
        for (let i = 0; i < issue.unionErrors.length; i++) {
          const branchLabel = `${label}.${labelSegment(i, depth + 1)}`
          const branchDetails = traverseIssues(
            issue.unionErrors[i].issues,
            prefix,
            branchLabel,
            depth + 2
          )
          results.push(...branchDetails)
        }
      }
    } else {
      const code = zodIssueToCode(issue)
      const path = formatPath(issue.path)
      const location = joinLocation(prefix, path)
      const labelPrefix = parentLabel ? `(${parentLabel}) ` : ''
      const detail = location
        ? `${labelPrefix}at ${location}: ${issue.message}`
        : `${labelPrefix}${issue.message}`

      results.push(makeProblemDetail(code, detail))
    }
  }

  return results
}

/**
 * Alternates letters and numbers per depth level.
 * Even depths: letters (A,B,C... at 0; a,b,c... at 2)
 * Odd depths: numbers (1,2,3...)
 */
function labelSegment(index: number, depth: number): string {
  if (depth % 2 === 1) return String(index + 1)
  if (depth === 0) return String.fromCharCode(65 + index) // A, B, C...
  return String.fromCharCode(97 + index) // a, b, c...
}

function isUnionIssue(
  issue: ZodIssue
): issue is ZodIssue & { unionErrors: ZodError[] } {
  return issue.code === 'invalid_union' && 'unionErrors' in issue
}

function joinLocation(
  prefix: string | undefined,
  path: string
): string {
  if (prefix && path) return `${prefix}.${path}`
  return prefix || path
}

function makeProblemDetail(code: ProblemDetailCode, detail: string): ProblemDetail {
  return {
    type: codeUrl(code),
    status: 400,
    title: code,
    detail
  }
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
