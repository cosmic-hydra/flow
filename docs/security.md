# Security model

## Trust boundaries

Flow treats users, AI output, provider output, browser automation, and network responses as untrusted. PostgreSQL is the authoritative state store. The approval record—not a chat message or model decision—is the only authority to invoke checkout.

## Spending boundary

The chat agent has no approve, execute, or purchase tool. It can create a booking, search, inspect state, list bookings, and select an offer for review.

A valid approval binds:

- user and booking;
- selected offer ID;
- provider ID;
- SHA-256 fingerprint of material offer data;
- maximum charge and ISO currency;
- absolute expiry;
- optional execution window.

Execution recomputes the fingerprint immediately before provider invocation. The provider's actual final total is validated afterward. Material changes, hidden totals, cross-currency changes, and higher prices fail closed.
Failed provider responses may omit a total; every non-failed response must include the provider's actual final total.

## Authentication

- Production refuses to start unless `FLOW_AUTH_MODE=required`.
- Required auth refuses secrets shorter than 32 characters.
- API tokens use 256 bits of randomness and are stored only as SHA-256 hashes.
- Browser sessions use separate random tokens stored as hashes.
- Session cookies are HTTP-only, `SameSite=Strict`, path-scoped, and `Secure` in production.
- Mutating requests with an `Origin` header must match `FLOW_WEB_ORIGIN`.
- CORS is restricted to the configured web origin.

The login form does not place API tokens in local storage, session storage, URLs, logs, or application state after exchange.

## Input and command safety

- Request bodies use strict Zod schemas with size and count bounds.
- Fastify rejects bodies larger than 1 MiB.
- Global and route-specific rate limits apply.
- `webcmd` is spawned without a shell.
- Site, command, and option names must match a conservative static pattern.
- Provider output is size-limited and parsed as JSON.
- BMS bridge output is size- and time-limited.
- UiPath arguments are JSON-encoded and sent to a configured release key.
- SQL values are parameterized.

Provider URLs and external payloads are never treated as executable shell fragments.

## Secrets and privacy

Logs redact authorization headers, cookies, tokens, and access-token-shaped fields. `redactedConfig` reports whether secrets are configured, never their values.

Flow does not store card numbers, UPI credentials, CVVs, bank logins, browser cookies, or CAPTCHA responses. Payment and strong-customer-authentication steps remain in the provider or authenticated browser handoff.

Checkout handoffs may store an owner-scoped HTTPS continuation or receipt URL returned by the provider. Non-HTTP schemes are rejected, raw provider payloads are not persisted with the handoff, and local screenshot paths are reduced to a boolean diagnostic.

Web coupon research receives a minimized booking summary. It excludes contact metadata, user email, phone number, payment data, and full conversation history. Responses API requests use `store: false`.

## Coupon abuse prevention

The engine accepts only public, source-backed codes and enforces a low attempt cap. It does not generate variants, enumerate codes, bypass eligibility, or use leaked/private promotions. Operators should set an even lower `FLOW_MAX_COUPON_ATTEMPTS` for providers with strict rate limits.

## Job safety

- Jobs have bounded attempts and leases.
- Execution jobs are idempotent by approval ID.
- Cancellation revokes active approval and cancels outstanding jobs.
- Checkout exceptions consume the approval because provider-side completion may be ambiguous.
- Worker logs and audit events capture failure without exposing payment details.

## Upstream automation

External automation code runs outside the core repository and is opt-in. Pin revisions, inspect diffs before upgrading, run it with a dedicated low-privilege account, and use an isolated browser profile.

The referenced Ticket Booking Bot source contains environment-specific configuration and credential material in its original workflow. Do not publish or execute that source unchanged. Remove secrets and machine-specific paths, rotate any exposed credentials, then publish only the sanitized workflow to your UiPath tenant.

The BMS Bot bridge is intentionally pinned and refuses to update a modified checkout. Its upstream package metadata mentions MIT, but the inspected revision does not include a root license file; confirm your right to use it before deployment.

## Production checklist

- Terminate TLS before the API.
- Use `NODE_ENV=production`, required auth, and a generated session secret.
- Use a dedicated database role and encrypted managed storage.
- Keep API and worker network access separate where possible.
- Restrict outbound provider domains.
- Store OpenAI and UiPath secrets in a secret manager.
- Run browser adapters under a dedicated OS account/profile.
- Disable the demo provider in a stricter deployment if simulated data is unacceptable.
- Define log retention and audit export policies.
- Add provider-specific rate limits and monitoring.
- Review third-party source and terms before every pinned upgrade.
- Run `npm audit`, `npm run verify`, database backup/restore tests, and a staging checkout handoff.

## Reporting vulnerabilities

Follow [SECURITY.md](../SECURITY.md). Do not open a public issue containing credentials, session data, provider cookies, or an exploitable checkout path.
