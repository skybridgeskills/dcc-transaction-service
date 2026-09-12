# OID4VCI 1.0 Pre-Authorized Code Flow

This service implements the **Pre-Authorized Code Flow** of
[OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
on top of the existing VCALM `claim` exchange. The pre-authorized
flow is a fit because the issuer has already authenticated the
end-user out-of-band — that's exactly what creating a `claim`
exchange represents — so the wallet can redeem the offer at the
Token Endpoint without a browser-redirect Authorization Code Flow.

## Endpoints

All endpoints are scoped per-exchange so the OID4VCI lifetime is
exactly the VCALM exchange's lifetime.

| Endpoint                        | Method | Path                                                                                  |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| Credential Offer                | `GET`  | `/workflows/claim/exchanges/:id/openid/credential-offer`                              |
| Credential Issuer Metadata      | `GET`  | `/.well-known/openid-credential-issuer/workflows/claim/exchanges/:id`                 |
| OAuth Authorization Server Meta | `GET`  | `/.well-known/oauth-authorization-server/workflows/claim/exchanges/:id`               |
| Token                           | `POST` | `/workflows/claim/exchanges/:id/openid/token`                                         |
| Token, by construction †        | `POST` | `/workflows/claim/exchanges/:id/token`                                                |
| Nonce                           | `POST` | `/workflows/claim/exchanges/:id/openid/nonce`                                         |
| Credential                      | `POST` | `/workflows/claim/exchanges/:id/openid/credential`                                    |

### Discovery constructions — both are served

A wallet does not fetch metadata from a URL we hand it. It **computes** the URL from the
`credential_issuer` value in the credential offer, and there are two ways to do that:

| Construction | URL for `credential_issuer = $HOST/workflows/claim/exchanges/:id` |
| --- | --- |
| **RFC 8414 §3.1 path-suffix** — well-known inserted after the **host** | `$HOST/.well-known/openid-credential-issuer/workflows/claim/exchanges/:id` |
| **OIDC Discovery 1.0 concatenation** — well-known **appended** to the identifier | `$HOST/workflows/claim/exchanges/:id/.well-known/openid-credential-issuer` |

RFC 8414 §3.1, which OID4VCI adopts, specifies the path-suffix form for issuer identifiers
that carry a path — and a per-exchange `credential_issuer` always does. **But wallets in the
wild compute the concatenated form**, and a wallet that guesses differently from its issuer
404s at discovery and abandons the flow before token, nonce or credential. One mismatch
therefore hides everything downstream.

This service serves **both**, from the same handlers, for all three names:

| Endpoint | Method | Concatenated path |
| --- | --- | --- |
| Credential Issuer Metadata | `GET` | `/workflows/claim/exchanges/:id/.well-known/openid-credential-issuer` |
| OAuth AS Metadata | `GET` | `/workflows/claim/exchanges/:id/.well-known/oauth-authorization-server` |
| OIDC Discovery alias | `GET` | `/workflows/claim/exchanges/:id/.well-known/openid-configuration` |

Two caveats worth knowing:

- **`openid-configuration` is a deliberate interop alias.** It returns the OID4VCI AS
  metadata document, which is *not* a conformant OIDC OP metadata document. It is served
  because wallets request that name during OID4VCI discovery.
- **Serving both makes this service permissive**, so it no longer discriminates between
  wallets on its own. Each metadata fetch therefore logs one line naming the construction
  used, so a wallet's discovery style stays observable without a proxy capture in front of
  it:

  ```
  oid4vci discovery: construction=oidc-concat doc=issuer exchange=<id>
  ```

  `construction` is `rfc8414-path-suffix` or `oidc-concat`; `doc` is `issuer`, `as` or
  `openid-configuration`.

### † The token endpoint by construction — an accommodation, not a route we advertise

Issuer metadata carries no `token_endpoint`. It names `authorization_servers`, and under
RFC 8414 that means the client fetches
`<authorization_server>/.well-known/oauth-authorization-server` and reads `token_endpoint`
out of *that* document. We serve it, at the path-insertion form and the concatenated form
both, and it returns the discovered endpoint: `<issuer>/openid/token`.

Some clients skip that fetch and **construct** the URL instead, by appending `/token` to
`authorization_servers[0]`. Without a route at that path the token request meets a 404, so
nothing downstream of the token can be observed at all.

So the token endpoint is **also** reachable at the constructed path. Three things about it
are load-bearing:

- **It is a concession, not a dialect.** RFC 8414 discovery is mandated; constructing the
  URL is a guess. Serving it does not make a client that uses it conformant, and whatever
  reads `discovery-served` lines to tell real discovery from a constructed guess can still
  tell the two apart here.
- **The discovered route stays the advertised one.** `buildOid4vciAsMetadata` still names
  `<issuer>/openid/token`, and issuer metadata still advertises no `token_endpoint` of its
  own. ⛔ Advertising one would make every wallet look conformant and erase that
  distinction for every product at once — which is why
  `src/oid4vci/issuer-metadata.test.ts` asserts it has not happened.
- **Serving it does not record it as discovery.** The constructed path writes an
  `accommodation-served` journal line and *no* `discovery-served` line, so a client that
  guesses still leaves no authorization-server discovery election behind. That absence is
  the point, and it survives the accommodation intact.

The reasoning and the rejected alternatives are in
[`docs/adr/2026-08-26-accommodated-routes-record-themselves.md`](adr/2026-08-26-accommodated-routes-record-themselves.md).
The register entry is `token-endpoint-by-convention` in
[`docs/accommodations.md`](accommodations.md);
an accommodation is only worth registering if something actually exercises it, and this
one is pinned by the OID4VCI route tests alongside its strict alternative.

## Flow

```
                                +-----------------------------------+
                                | POST /exchange  (existing route)  |
                                |  ↳ creates claim exchange         |
                                +-----------------------------------+
                                          │
                                          ▼
                                 protocols.OID4VCI is
        openid-credential-offer://?credential_offer_uri=<...>/openid/credential-offer

  Wallet                                                 dcc-transaction-service
  ──────                                                 ────────────────────────
   1. follow the deep link's `credential_offer_uri`
       GET /openid/credential-offer
       ◄──── { credential_issuer, credential_configuration_ids,
                grants: { ":pre-authorized_code": { "pre-authorized_code": ... } } }

   2. discover issuer metadata
       GET /.well-known/openid-credential-issuer/workflows/claim/exchanges/:id
       ◄──── { credential_endpoint, nonce_endpoint, credential_configurations_supported, ... }

   3. discover AS metadata
       GET /.well-known/oauth-authorization-server/workflows/claim/exchanges/:id
       ◄──── { token_endpoint, grant_types_supported, ... }

   4. redeem the pre-authorized code for an access token
       POST /openid/token (form: grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code,
                                 pre-authorized_code=<code>)
       ◄──── { access_token, token_type: "Bearer", expires_in: 600 }

   5. get a fresh c_nonce
       POST /openid/nonce
       ◄──── { c_nonce }

   6. submit the Credential Request
       POST /openid/credential
         Authorization: Bearer <access_token>
         Content-Type: application/json
         { credential_configuration_id, proofs: { di_vp: [<DI VP bound to c_nonce>] } }
       ◄──── { credentials: [{ credential: <signed VC> }] }
```

The exchange transitions `pending → active → complete` exactly like
the VCALM flow, so existing polling clients continue to work.

## End-to-end curl walk-through

The example below uses `localhost:4004`; substitute your
`DEFAULT_EXCHANGE_HOST` for cross-device testing.

```sh
HOST=http://localhost:4004
TOKEN=<TENANT_TOKEN_DEFAULT>

# 1) Create the exchange (returns a wallet query batch).
curl -fsS "$HOST/exchange" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "tenantName": "default",
        "exchangeHost": "'"$HOST"'",
        "workflowId": "claim",
        "data": [{
          "vc": "{\"@context\":[\"https://www.w3.org/ns/credentials/v2\",\"https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json\"],\"type\":[\"VerifiableCredential\",\"OpenBadgeCredential\"],\"credentialSubject\":{}}",
          "retrievalId": "demo"
        }]
      }'

# 2) Get the exchange protocols (includes `OID4VCI`).
EXCHANGE_ID=<extract from step 1>
curl -fsS "$HOST/workflows/claim/exchanges/$EXCHANGE_ID/protocols" | jq .

# 3) Wallet would scan the deep link; we follow the `credential_offer_uri` directly.
curl -fsS "$HOST/workflows/claim/exchanges/$EXCHANGE_ID/openid/credential-offer" | jq .

# 4) Discover metadata.
curl -fsS "$HOST/.well-known/openid-credential-issuer/workflows/claim/exchanges/$EXCHANGE_ID" | jq .
curl -fsS "$HOST/.well-known/oauth-authorization-server/workflows/claim/exchanges/$EXCHANGE_ID" | jq .

# 5) Redeem the pre-authorized code.
PRE_AUTH=<extract from step 3>
curl -fsS "$HOST/workflows/claim/exchanges/$EXCHANGE_ID/openid/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code" \
  --data-urlencode "pre-authorized_code=$PRE_AUTH" | jq .

# 6) Fetch a c_nonce.
ACCESS_TOKEN=<extract from step 5>
curl -fsS -X POST "$HOST/workflows/claim/exchanges/$EXCHANGE_ID/openid/nonce" | jq .

# 7) Submit the Credential Request — di_vp[0] must be a Data Integrity VP bound to c_nonce.
curl -fsS "$HOST/workflows/claim/exchanges/$EXCHANGE_ID/openid/credential" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"credential_configuration_id\": \"OpenBadgeCredential\",
        \"proofs\": { \"di_vp\": [<signed VP JSON>] } }" | jq .
```

## Errors

| Failure                                | Status | Body                                       |
| -------------------------------------- | ------ | ------------------------------------------ |
| Missing / wrong / replayed pre-auth    | `400`  | `{ "error": "invalid_grant" }`             |
| Missing pre-authorized_code            | `400`  | `{ "error": "invalid_request" }`           |
| Unsupported grant_type                 | `400`  | `{ "error": "unsupported_grant_type" }`    |
| Missing / wrong access token           | `401`  | `{ "error": "invalid_token" }`             |
| Malformed credential request body      | `400`  | `{ "error": "invalid_credential_request" }`|
| Unknown `credential_configuration_id`  | `400`  | `{ "error": "unknown_credential_configuration" }` |
| Missing or invalid `proofs.di_vp[0]`   | `400`  | `{ "error": "invalid_proof" }`             |
| Wrong / replayed / expired `c_nonce`   | `400`  | `{ "error": "invalid_nonce" }`             |
| Credential already issued (complete)   | `400`  | `{ "error": "credential_request_denied" }` |

Token + nonce endpoints set `Cache-Control: no-store` per RFC 6749
and OID4VCI 1.0 §7.2 respectively.

## Holder binding

The issued `credentialSubject.id` is bound to the **controller of the key
that signed the `di_vp` proof** — i.e. the DID portion (before the `#`
fragment) of the authentication proof's `verificationMethod`. It is never
taken from the self-asserted top-level `holder` field, which no verifier
layer checks. If the proof carries a `holder` that disagrees with the
signer, the request is rejected with `invalid_proof`. This ensures a
credential is only ever issued to a DID whose key the presenter controls.

## Out of scope (deferred follow-ups)

The current implementation intentionally omits the following pieces
of the spec; they're tracked as future plans:

- **Authorization Code Flow** (`response_type=code`, browser redirect,
  PKCE, Pushed Authorization Requests).
- **Transaction Code** (`tx_code`) for emailed-PIN binding of the
  pre-authorized code.
- **Deferred Credential Endpoint** (Section 9).
- **Notification Endpoint** (Section 11).
- **Encrypted Credential Requests / Responses** (Section 10).
- **DPoP-bound access tokens**.
- **Format profiles other than `ldp_vc`** (e.g. `jwt_vc_json`,
  `dc+sd-jwt`, `mso_mdoc`).
- **Key proof types other than `di_vp`** (e.g. `jwt`, `cwt`).

## State storage

OID4VCI runtime state — pre-authorized code, access token, current
nonce — lives inline on the exchange record under
`variables.oid4vci`, bounded by the exchange's own TTL. Code TTL is
10 minutes, access token TTL is 10 minutes, nonce TTL is 5 minutes,
each clamped to the exchange's remaining lifetime.
