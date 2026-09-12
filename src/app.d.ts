import type {
  EntityIdentityRegistry,
  SuiteSummary as VerifierCoreSuiteSummary,
  TaskTiming as VerifierCoreTaskTiming
} from '@digitalcredentials/verifier-core'

declare global {
  namespace App {
    /** Issuer identity + cryptosuite + signing-service tenant for one issuance line. */
    interface IssuerInstance {
      id: string
      cryptosuite: string
      signingServiceTenant: string
    }

    interface Tenant {
      tenantName: string
      tenantToken: string
      origin?: string
      /** When set, signing uses these rows; otherwise legacy behavior uses exchange tenant name. */
      issuerInstances?: IssuerInstance[]
      /**
       * Protocol profile this tenant's exchanges use when the exchange names
       * none of its own, from `TENANT_PROFILE_<NAME>`. The middle layer of the
       * three; see `protocol-profiles/resolve.ts`.
       */
      protocolProfileName?: string
    }

    interface Config {
      port: number
      defaultExchangeHost: string
      exchangeTtl: number
      statusService: string
      /**
       * Bearer token for the status service, which authenticates every write.
       * Global rather than per-tenant: this service talks to status as one
       * client today. Per-tenant tokens land if that stops being true.
       */
      statusServiceToken: string
      signingService: string
      defaultWorkflow: string
      defaultTenantName: string
      /**
       * When true (default), the interaction UI may show an expandable details
       * section for verification and other workflows. Set `UI_SHOW_DETAILS=false` to hide.
       */
      uiShowDetails: boolean
      /** HS256 secret for OAuth access JWTs (client_credentials). Empty disables issuance. */
      accessJwtSecret: string
      /**
       * Filesystem path for the append-only exchange journal (JSONL), from
       * `EXCHANGE_JOURNAL_PATH`. Undefined selects the no-op sink, which is
       * the default: the journal records nothing and creates no file unless a
       * deployment asks for it.
       *
       * Deliberately separate from `keyvFilePath`. The Keyv store is the live,
       * TTL-evicted exchange record; the journal is the durable one. See
       * `docs/adr/2026-08-11-exchange-journal-durable-record.md`.
       */
      exchangeJournalPath?: string
      keyvFilePath?: string
      redisUri?: string
      keyvWriteDelayMs: number
      keyvExpiredCheckDelayMs: number
      tenants: Record<string, Tenant>
      tenantAuthenticationEnabled: boolean
      defaultTrustedRegistryNames: string[]
      /**
       * Static DCC registries plus env-driven entries (`REGISTRY_OIDF_*`,
       * `REGISTRY_VC_RECOGNITION_*`).
       */
      knownRegistries: Record<string, EntityIdentityRegistry>
      /**
       * Default value for `BaseVariables.debug` when an exchange does not
       * specify it. Set env `EXCHANGE_DEBUG_DEFAULT=true` (or `1` / `yes`)
       * to enable globally.
       */
      defaultExchangeDebug: boolean
      /**
       * Per-attempt deadline (ms) for asynchronous Open Badges verification
       * tasks. A task whose `deadlineAt` has lapsed is eligible for retry on
       * the next GET-driven sweep. Override with `VERIFY_TASK_DEADLINE_MS`.
       */
      verifyTaskDeadlineMs: number
      /**
       * Maximum number of attempts (initial + retries) for an async verify
       * task before it is marked `gave-up` and the exchange transitions to
       * `'invalid'` with a synthetic timeout CheckResult. Override with
       * `VERIFY_TASK_MAX_ATTEMPTS`.
       */
      verifyTaskMaxAttempts: number
      /**
       * Protocol profile served when neither the exchange nor its tenant names
       * one, from `DEFAULT_PROTOCOL_PROFILE`. The last of the three resolution
       * layers.
       *
       * ⚠️ Undefined is not a fallback to "whatever we did before" — with no
       * layer naming a profile, resolution throws. See
       * `protocol-profiles/resolve.ts` for why guessing is the worse failure.
       */
      defaultProtocolProfileName?: string
    }

    /**
     * The `protocols` map an interaction URL resolves to — VCALM's
     * "interaction protocols response": each key a protocol identifier, each
     * value a URL that can be used to initiate the interaction.
     *
     * ⚠️ **Which keys appear is a protocol-profile decision**, not a constant,
     * which is why there is an index signature. The named members below are
     * the ones this service has always emitted and that callers read directly;
     * the signature is what lets a profile add a spelling without a type change
     * at every call site.
     *
     * ⚠️ **`interact` is deliberately NOT a member.** In VCALM it does not mean
     * "our interaction URL" — it is a delegation mechanism, *"used to redirect
     * a wallet to a different interaction URL, where the exchange will
     * continue"*. Emitting our own interaction URL under it would tell a wallet
     * to go somewhere else and land it back here. See
     * `docs/protocol-profiles.md`.
     */
    interface ExchangeProtocols {
      /** The interaction URL itself — the thing whose GET returns this map. */
      iu: string
      /** The exchange id URL, per VCALM's `vcapi` interaction protocol. */
      vcapi: string
      /**
       * ⚠️ A wallet-specific convenience, not a VCALM protocol. Grandfathered:
       * existing callers read it and legacy protocol keys are kept, not renamed.
       */
      lcw?: string
      /** ⚠️ Deprecated in VCALM, retained indefinitely for backwards compatibility. */
      OID4VCI?: string
      /** ⚠️ Deprecated in VCALM, retained indefinitely for backwards compatibility. */
      OID4VP?: string
      /** The versioned spelling VCALM advises implementers to use. */
      'oid4vci-1.0'?: string
      /** The versioned spelling VCALM advises implementers to use. */
      'oid4vp-1.0'?: string
      verifiablePresentationRequest?: unknown
      [key: string]: unknown
    }

    interface ErrorResponseBody {
      code: number
      message: string
      details?: Array<{
        code: string
        message: string
        path: Array<string>
      }>
    }

    interface Credential extends Record<string, unknown> {
      credentialSubject: Record<string, unknown> & {
        id: string
      }
    }

    interface ExchangeBatch {
      data: Array<{
        vc: string // JSON template string
        subjectData?: Record<string, unknown>
        retrievalId?: string // Optional for later retrieval/correlation of this record
        metadata?: Record<string, unknown> // Additional data to store related to the exchange
        redirectUrl?: string
      }>
      batchId?: string
      exchangeHost: string
      tenantName?: string
      workflowId?: string
    }

    interface ExchangeCreateInput {
      expires?: string
      /**
       * Caller-supplied component of the minted `exchangeId`. Validated by
       * `vcApiExchangeCreateSchema`; see `lib/mint-exchange-id.ts`.
       *
       * A sibling of `variables`, not a member of it: it is an instruction to
       * the id minter, consumed once at creation, not an exchange variable
       * interpolated into credential templates.
       */
      exchangeIdPrefix?: string
      variables: Record<string, unknown> & {
        vc?: string
        redirectUrl?: string
        exchangeHost: string
        tenantName?: string
        challenge?: string
      }
    }

    type SupportedWorkflowIds = 'didAuth' | 'claim' | 'verify' | 'healthz'
    type ExchangeState = 'pending' | 'active' | 'complete' | 'invalid'

    interface BaseVariables {
      /** Post-signing corruption for negative test cases. See `schema.ts`. */
      tamper?: 'proof' | 'claim' | 'issuer'
      /**
       * ACCOMMODATION — `token-endpoint-inline`, VARIANT, **default off**.
       * Publish `token_endpoint` inline in the issuer metadata for a client
       * that never performs RFC 8414 AS discovery. ⛔ Per-exchange opt-in only;
       * serving it by default erases
       * `authorization-server-metadata-discovery` for every vendor at once.
       * See `schema.ts` for the full reasoning.
       */
      oid4vciTokenEndpointInline?: boolean
      redirectUrl?: string
      retrievalId?: string
      exchangeHost: string
      metadata?: Record<string, unknown>
      challenge: string // Used to authenticate presentations
      results?: Record<string, unknown>
      /**
       * UI and client feature flags (short keys, string or boolean values).
       * Example: `{ details: true }` toggles advanced verification details.
       */
      features?: Record<string, string | boolean>
      /**
       * When true, the workflow attaches compatibility-fix log entries (and
       * any other debug-only diagnostics) to `variables.results`. Defaults
       * to `Config.defaultExchangeDebug`.
       */
      debug?: boolean
      /**
       * Verifier-core call-time options surfaced verbatim on every
       * `verifyPresentation` / `verifyCredential` invocation for this
       * exchange. Workflows that don't call verifier-core ignore this
       * field; the schema accepts it universally so a single CLI flag
       * (`--verbose` / `--timing`) works across workflows.
       *
       * - `verbose`: when true, verifier-core returns every check that
       *   ran on `results[]` (otherwise only failures + explicit
       *   skips). Per-suite `summary[]` is populated either way.
       * - `timing`: when true, every result carries `timing` rollups
       *   ({@link App.TaskTiming}).
       */
      options?: {
        verbose?: boolean
        timing?: boolean
      }
      /**
       * Protocol profile this exchange asks to be served under — the most
       * specific of the three resolution layers, beating the tenant default
       * and the app default.
       *
       * A NAME, never a definition. Definitions are the service's own
       * versioned data (`protocol-profiles/registry.ts`); a caller that could
       * supply one could make this service emit bytes no name accounts for,
       * which is the thing named profiles exist to prevent.
       */
      protocolProfileName?: string
    }

    interface ExchangeDetailBase {
      // Local metadata
      tenantName: string
      workflowId: SupportedWorkflowIds

      // VC-API metadata
      exchangeId: string
      /**
       * The prefix the creating caller asked for, if any. Retained on the
       * record because the create request is spread onto it, and retaining it
       * is the honest option: the value is already visible in `exchangeId`, so
       * stripping it would hide the instruction without hiding its effect.
       * Reading it is never necessary — parse `exchangeId` instead, which is
       * what every off-service reader has to do anyway.
       */
      exchangeIdPrefix?: string
      expires: string
      state: ExchangeState
      variables: BaseVariables

      // Observations about the client, recorded as they happen
      /**
       * Which well-known constructions this exchange actually served, in the
       * order they were first fetched. See {@link DiscoveryElection}.
       *
       * Absent until a metadata document is fetched, which is the honest
       * encoding: "no client has asked yet" and "a client asked in no
       * construction" are not the same observation.
       */
      discoveryElections?: DiscoveryElection[]
      /**
       * Which interaction methods this exchange's interaction page displayed,
       * in the order they were first shown. See {@link
       * InteractionMethodElection}.
       *
       * Absent until something is shown, not `[]`. *"No interaction method has
       * been shown"* and *"an interaction method was shown under no profile"*
       * are not the same observation, and only one of them is a fact about a
       * scan.
       */
      interactionMethodElections?: InteractionMethodElection[]
    }

    /**
     * Which well-known layout a client used to reach a metadata document.
     *
     * `rfc8414-path-suffix` — well-known inserted after the host, issuer path
     * appended. RFC 8414 §3.1, which OID4VCI adopts, for issuer identifiers
     * that carry a path.
     * `oidc-concat` — well-known appended to the issuer identifier, the OpenID
     * Connect Discovery 1.0 style.
     */
    type DiscoveryConstruction = 'rfc8414-path-suffix' | 'oidc-concat'

    /** Which metadata document was served. */
    type DiscoveryDoc = 'issuer' | 'as' | 'openid-configuration'

    /**
     * One construction/document pair a client elected, with the time it was
     * first seen.
     *
     * This service serves both constructions and therefore discriminates on
     * neither; what a client *chose* is consequently a fact about the client
     * and nothing else, and it is invisible unless it is written down. It is
     * recorded on the exchange record as well as in the journal because the
     * two have different readers: a caller polling `GET` on the exchange sees
     * this field, and a reader working from the durable journal after the
     * record has been evicted sees the `discovery-served` lines.
     *
     * A set, in first-fetch order, rather than a single value: a client may
     * fetch one construction, the other, or both, and "tried both" is a
     * different observation from "took the concatenated form". Repeat fetches
     * of a pair already recorded do not append — every individual fetch is in
     * the journal, and an unbounded array on a record a client can grow by
     * polling is not.
     */
    interface DiscoveryElection {
      construction: DiscoveryConstruction
      doc: DiscoveryDoc
      /** ISO 8601, at the first fetch of this construction/document pair. */
      at: string
    }

    /**
     * One interaction method a page displayed, with the construction it
     * displayed it under.
     *
     * A set in first-election order, repeats not appended — the same shape and
     * the same reasoning as {@link DiscoveryElection}, whose docblock is the
     * long version. See `lib/interaction-method-election.ts`.
     *
     * ⚠️ **The set takes recognised elections only.**
     * `interaction-method-shown` takes its payload from the client, so the
     * client picks the bytes; the route adds an entry only for a payload the
     * server itself can rebuild for an offerable preset. That bounds the set by
     * the offerable set and makes every entry one this service can vouch for.
     * The journal still takes every reported interaction method, including one
     * that parses to nothing.
     */
    interface InteractionMethodElection {
      /**
       * The envelope key — `iu`, `OID4VP`, `lcw`.
       *
       * ⚠️ The join key every recorded run cites, which is why it is recorded
       * beside the construction rather than in place of it.
       */
      payloadId: string
      protocolProfileName: string
      /**
       * ⚠️ Where the name came from, and the two are NOT interchangeable.
       *
       * `payload` — the QR itself named it, so the record is a fact about the
       * bytes that were on screen. `active` — the payload named nothing, so
       * this is the profile the SERVER resolved at the moment the interaction
       * method was shown. Still true, but true about a resolution rather than
       * about the QR, and a later reader must be able to tell which. Mirrors
       * `ResolvedProtocolProfileName.source`.
       */
      source: 'payload' | 'active'
      /** ISO 8601, at the first election of this pair. */
      at: string
    }

    interface DcqlClaim {
      id?: string
      path: string[]
      values?: string[]
    }

    /**
     * OID4VCI 1.0 Pre-Authorized Code Flow runtime state, populated lazily
     * the first time a wallet hits `/openid/credential-offer` for the
     * exchange. Holds the pre-authorized code, the opaque access token,
     * and the most recently issued single-use `c_nonce`. TTLs are wall
     * clock and bounded by the exchange's own `expires`.
     *
     * Stored inline on the exchange so all OID4VCI lifecycle state lives
     * in a single Keyv record alongside the rest of the exchange.
     */
    interface ExchangeOid4vciState {
      preAuthorizedCode?: string
      preAuthorizedCodeExpiresAt?: string
      codeUsed?: boolean
      accessToken?: string
      accessTokenExpiresAt?: string
      cNonce?: string
      cNonceExpiresAt?: string
      nonceUsed?: boolean
    }

    /**
     * OID4VP 1.0 verifier runtime state, populated lazily the first time a
     * wallet GETs the authorization request (`/openid4vp/request`). Bound to
     * the exchange's own `challenge` (used as the OID4VP `nonce`); `state` is
     * a single-use correlation token echoed back on the `direct_post`
     * response.
     *
     * Stored inline on the exchange so all OID4VP lifecycle state lives in a
     * single Keyv record alongside the rest of the exchange (mirrors
     * {@link ExchangeOid4vciState}).
     */
    interface ExchangeOid4vpState {
      /** Opaque correlation token; echoed in the request `state` and required on direct_post. */
      state?: string
      /** True once a direct_post response has been accepted (replay guard). */
      responseReceived?: boolean
      /**
       * Which query language this exchange asks in. Per-exchange rather than
       * global so one test run can exercise both query languages — a DCQL
       * exchange and a PEX exchange minutes apart, with no restart and no mode
       * leaking between them.
       * Recorded explicitly (never left implicit) so the exchange record
       * states which language it used. Defaults to `dcql`.
       */
      queryLanguage?: Oid4vpQueryLanguage
      /**
       * How this exchange delivered the authorization request. Per-exchange
       * for the same reason `queryLanguage` is: one test run exercises both
       * arms minutes apart with no restart and no mode leaking between them.
       * Recorded explicitly so the exchange record states which delivery it
       * used. Defaults to `by-reference`.
       */
      delivery?: Oid4vpDelivery
    }

    /**
     * OID4VP credential query languages this verifier can speak — including
     * **both at once**.
     *
     * ⚠️ `both` is reachable only from a protocol profile, never from the
     * per-exchange knob, and the asymmetry is deliberate: `oid4vpQueryLanguage`
     * on the exchange stays two-valued because a caller choosing a language is
     * choosing one, while a *profile* can state the accommodation that carries
     * `dcql_query` and `presentation_definition` in one request.
     *
     * ⚠️ The recorded value is three-valued because the RECORD has to be able
     * to say what actually went out. Narrowing it to the knob's two values
     * would make an exchange served under the accommodation claim on its own
     * record to have asked in one language, which is the sort of quietly wrong
     * attribution that is expensive to unpick later.
     */
    type Oid4vpQueryLanguage = 'dcql' | 'pex' | 'both'

    /**
     * How the authorization request reaches the wallet.
     *
     * `by-value` — every parameter inline in the `openid4vp://` URL. The ONLY
     * conformant delivery under the `redirect_uri` Client Identifier prefix,
     * because §5.9.3 forbids signing such a request while §5.10.1 / RFC 9101
     * require a `request_uri` response to be a signed JWT.
     *
     * `by-reference` — `client_id` + `request_uri`, answered with unsigned
     * `application/json`. ⚠️ Undefined in every published OID4VP version, and
     * the default only because it is what this service has always emitted;
     * moving it would change every by-reference construction at once. See
     * `oid4vp/deep-link.ts`.
     */
    type Oid4vpDelivery = 'by-reference' | 'by-value'

    /**
     * DIF PE `constraints.limit_disclosure` value a PEX verify exchange asks
     * for. When set, the emitted `presentation_definition` instructs a
     * conformant wallet to return ONLY the matched fields.
     */
    type Oid4vpLimitDisclosure = 'required' | 'preferred'

    interface ExchangeDetailClaim extends ExchangeDetailBase {
      workflowId: 'claim'
      variables: BaseVariables & {
        vc: string
        oid4vci?: ExchangeOid4vciState
        results?: {
          default: {
            verifiableCredential: unknown[]
            /** Compatibility-fix log entries; populated only when `variables.debug === true`. */
            compatLog?: CheckResult[]
          }
        }
      }
    }

    interface ExchangeDetailDidAuth extends ExchangeDetailBase {
      workflowId: 'didAuth'
      variables: BaseVariables & {
        results?: {
          default: {
            holder: string
            /** Compatibility-fix log entries; populated only when `variables.debug === true`. */
            compatLog?: CheckResult[]
          }
        }
      }
    }

    /**
     * Problem detail per RFC 9457.
     * Used in CheckResult failure outcomes.
     */
    interface ProblemDetail {
      type: string
      title: string
      detail: string
      status?: number
      [key: string]: unknown
    }

    /**
     * Check result from verifier-core suite-based verification.
     * Replaces the legacy VerificationStepResult format.
     */
    interface CheckResult {
      /**
       * Dot-separated namespaced id assigned by `verifier-core`
       * post-`runSuites` (e.g. `"cryptographic.core.proof-exists"`).
       * Service-local synthetic checks (compat-fix log entries) use
       * the reserved `"compat.<obj-type>.<fix-name>"` namespace so
       * UI consumers can prefix-filter them out.
       */
      id: string
      /** Discriminated outcome */
      outcome:
        | { status: 'success'; message: string; payload?: unknown }
        | { status: 'failure'; problems: ProblemDetail[] }
        | { status: 'skipped'; reason: string }
      /** Whether this check failure is fatal to overall verification */
      fatal?: boolean
      /** Per-check timing; only present when verifier-core was called with `timing: true`. */
      timing?: TaskTiming
    }

    /** Re-export of verifier-core's `SuiteSummary` for use by app code. */
    type SuiteSummary = VerifierCoreSuiteSummary
    /** Re-export of verifier-core's `TaskTiming` for use by app code. */
    type TaskTiming = VerifierCoreTaskTiming

    /**
     * Per-credential verification result from verifier-core.
     *
     * Field name `verifiableCredential` mirrors verifier-core's public
     * shape (post-1.0) and the W3C / VCALM property name, so the result
     * object can be spread into a VCALM exchange's per-step variables and
     * accessed via `results.<step>.credentialResults[i].verifiableCredential.…`.
     */
    interface CredentialVerificationResult {
      /** True if no check returned a failure outcome */
      verified: boolean
      /** The parsed credential that was verified */
      verifiableCredential: unknown
      /**
       * Flat array of results from all suites for this credential. In
       * non-verbose mode (the default since verifier-core 2.0.0), this
       * carries only failures and explicit `<suite>.applies` skips;
       * passes are folded into {@link summary}. In verbose mode it
       * carries every check.
       */
      results: CheckResult[]
      /**
       * Per-suite rollup. Always populated by verifier-core 2.x
       * regardless of `verbose`. Primary surface for UI rendering.
       *
       * Optional during the multi-phase migration in the
       * `verifier-core-2-results-consumption` plan; phase 7 makes it
       * required.
       */
      summary: SuiteSummary[]
      /**
       * Stable id of the matched recognizer (e.g. `"obv3p0.openbadge"`)
       * when the recognition pipeline produced a normalized form.
       */
      recognizedProfile?: string
      /**
       * Normalized view of the credential, produced by a recognizer.
       * Cast to the recognizer-specific shape based on
       * {@link recognizedProfile}.
       */
      normalizedVerifiableCredential?: unknown
      /** Inclusive top-level timing; only present when `timing: true`. */
      timing?: TaskTiming
      /** True when produced under a non-default suite-phase filter. */
      partial?: boolean
    }

    /**
     * Legacy verification step result format.
     * @deprecated Kept for backward compatibility. Use CheckResult instead.
     */
    interface VerificationStepResult {
      id: string
      valid: boolean
      error?: {
        name: string
        message: string
        stackTrace?: unknown
      }
      foundInRegistries?: string[]
      registriesNotLoaded?: string[]
    }

    /**
     * Verification result matching the new verifier-core format.
     * Note: This is a breaking change from the old format which used
     * verifiablePresentation/errors/log structure.
     */
    interface VerificationResult {
      /** Overall verification status - true if no fatal failures */
      verified: boolean

      /** Presentation-level check results (VP signature verification) */
      presentationResults: CheckResult[]

      /** Per-credential verification results */
      credentialResults: CredentialVerificationResult[]

      /** Credentials that matched the claims requirements */
      matchedCredentials: unknown[]

      /**
       * Presentation-level per-suite rollup; per-credential rollups live
       * on each `credentialResults[i].summary`.
       */
      summary: SuiteSummary[]

      /** The parsed VP, if available from verifier-core. */
      verifiablePresentation?: unknown

      /**
       * Compatibility-fix log entries gated on `variables.debug === true`.
       * Each entry has an `id` of the form `compat.<obj-type>.<fix-name>`.
       */
      compatLog?: CheckResult[]

      /** Inclusive top-level timing; only present when `timing: true`. */
      timing?: TaskTiming

      /** True when produced under a non-default suite-phase filter. */
      partial?: boolean

      /** Optional claims validation details */
      claimsValidation?: {
        extractedClaims: Record<string, unknown>
        requiredClaims: DcqlClaim[]
        matched: boolean
        missingClaims?: string[]
      }

      /** Optional issuer validation details */
      issuerValidation?: {
        trustedIssuers: string[]
        trustedRegistries: string[]
        issuerFound: boolean
        registryMatch: boolean
      }
    }

    /** Lifecycle status of the asynchronous verify-task pass for a verify exchange. */
    type VerifyTaskStatus =
      | 'queued'
      | 'running'
      | 'succeeded'
      | 'failed'
      | 'gave-up'

    /**
     * Metadata for the asynchronous Open Badges verification pass attached
     * to a verify exchange's `variables`.
     *
     * The synchronous POST handler runs the default verifier-core suites
     * inline and persists the partial result; if any embedded credential is
     * an Open Badges credential, it also persists a `VerifyTask` and
     * enqueues a background worker that re-verifies those credentials with
     * the OB suite. Workers commit through `saveExchangeWithCAS` keyed on
     * `attemptId`, so a stale worker whose attempt was superseded by a
     * sweep cannot overwrite a newer commit.
     */
    interface VerifyTask {
      /**
       * Generation token for the *current attempt*. Bumped on retry so
       * stale workers detect they were superseded.
       */
      attemptId: string
      /** ISO 8601 wall-clock when the current attempt was queued. */
      queuedAt: string
      /** ISO 8601 wall-clock when the current attempt began executing. */
      startedAt?: string
      /**
       * ISO 8601 wall-clock by which this attempt must finish; otherwise it
       * is eligible for retry on the next GET-driven sweep.
       */
      deadlineAt: string
      /** 1-indexed attempt counter (initial attempt is `1`). */
      attempt: number
      /** Maximum attempts (initial + retries) before giving up. */
      maxAttempts: number
      /**
       * Indices into `variables.results.default.credentialResults` that
       * still need OB processing on this attempt.
       */
      openBadgesCredentialIndices: number[]
      /** Lifecycle status. */
      status: VerifyTaskStatus
      /** Optional summary of the most recent failure for diagnostics. */
      lastError?: { message: string; at: string }
    }

    interface ExchangeDetailVerify extends ExchangeDetailBase {
      workflowId: 'verify'
      variables: BaseVariables & {
        vprContext: string[]
        vprCredentialType: string[]
        trustedIssuers: string[]
        trustedRegistries?: string[]
        vprClaims: DcqlClaim[]
        /** Requested at exchange creation; copied onto `oid4vp.queryLanguage`. */
        /**
         * ⚠️ Two-valued, unlike {@link Oid4vpQueryLanguage}. A caller choosing
         * a query language is choosing one; the both-at-once accommodation is
         * a profile, not a knob.
         */
        oid4vpQueryLanguage?: 'dcql' | 'pex'
        /**
         * Requested at exchange creation; copied onto `oid4vp.delivery`.
         * Defaults to `by-reference` — see {@link Oid4vpDelivery} for why the
         * default is the non-conformant arm and why it is nonetheless kept.
         */
        oid4vpDelivery?: Oid4vpDelivery
        /**
         * Requested at exchange creation; when set (PEX only) it is threaded
         * into `buildPresentationDefinition` as `constraints.limit_disclosure`.
         * Optional so exchanges that omit it emit an unchanged request.
         */
        vprLimitDisclosure?: Oid4vpLimitDisclosure
        oid4vp?: ExchangeOid4vpState
        results?: { default: VerificationResult }
        verifyTask?: VerifyTask
      }
    }

    interface WorkflowStep {
      createChallenge: boolean
      verifiablePresentationRequest: {
        query: Array<{ type: string } & Record<string, unknown>>
      }
    }

    interface Workflow {
      id: SupportedWorkflowIds
      steps: Record<string, WorkflowStep>
      initialStep: string
      credentialTemplates?: Array<{
        id: string
        type: 'handlebars' // TODO: add 'jsonata'
        template: string
      }>
    }

    interface VPR {
      query: {
        type: 'DIDAuthentication' | 'QueryByExample'
      } & Record<string, unknown>
      interact: {
        service: Array<{
          type:
            | 'VerifiableCredentialApiExchangeService'
            | 'UnmediatedPresentationService2021'
            | 'CredentialHandlerService'
          serviceEndpoint?: string
        }>
      }
      challenge: string
      domain: string
      /** What this endpoint can verify on incoming presentations (not issuance policy). */
      acceptedCryptosuites?: Array<{ cryptosuite: string }>
    }

    interface Protocols {
      vcapi?: string
      verifiablePresentationRequest: VPR
      lcw?: string
      /**
       * OID4VCI 1.0 deep link of the form
       * `openid-credential-offer://?credential_offer_uri=...`. Present
       * only on `claim` exchanges (the workflow that supports OID4VCI
       * Pre-Authorized Code Flow).
       *
       * Spelt uppercase to match the OID4VCI 1.0 spec name and to mirror
       * the convention from the prior sveltekit spike. Other protocol
       * keys (`vcapi`, `lcw`, …) stay lowercase because they originate
       * from VC-API.
       */
      OID4VCI?: string
      /**
       * OID4VP 1.0 deep link of the form
       * `openid4vp://?client_id=...&request_uri=...`. Present only on
       * `verify` exchanges (the workflow that supports the OID4VP 1.0
       * verifier binding).
       *
       * Spelt uppercase to match the OID4VP 1.0 spec name and to mirror the
       * {@link Protocols.OID4VCI} convention. The `request_uri` GET lazily
       * mints the single-use `state`, so no exchange state needs to be
       * persisted for this entry to be valid.
       */
      OID4VP?: string
    }

    interface DCCWalletQuery {
      retrievalId: string
      directDeepLink: string
      vprDeepLink: string
      chapiVPR?: VPR
      metadata?: Record<string, unknown>
    }
  }
}

export {}
