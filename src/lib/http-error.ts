/**
 * App-local HTTP error for service/protocol layers.
 * Route handlers catch this and convert to SvelteKit responses (json/error).
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    Object.setPrototypeOf(this, HttpError.prototype)
  }
}
