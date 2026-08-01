# Architecture

## Design goals

Flow is designed around four constraints:

1. Research can be autonomous; spending cannot.
2. Booking work must survive process restarts and future execution dates.
3. Provider-specific behavior must not leak into the core domain.
4. Every material state change must be attributable and inspectable.

The result is a modular monorepo with a shared contract layer, a deterministic domain core, provider adapters, a PostgreSQL persistence boundary, and independently deployable API, worker, and web processes.

## Process topology

### API

The Fastify API owns authentication, request validation, conversations, synchronous search requests, offer selection, approval creation, cancellation, provider health, and OpenAPI documentation. It does not poll scheduled work.

All untrusted request bodies are parsed through strict Zod schemas. The API exposes domain objects rather than provider payloads and converts expected domain failures into bounded HTTP errors.

### Worker

The worker leases due jobs from PostgreSQL and handles:

- initial booking research;
- recurring offer refreshes;
- approved execution.

Job claiming uses a transaction with row locking and `SKIP LOCKED`. A lease owner and expiry allow another worker to recover abandoned work. Idempotency keys prevent duplicate jobs for the same logical research or execution event.

### Web application

The React application provides two input paths:

- natural-language chat for planning;
- a structured request form for deterministic control.

The client never receives or persists raw API tokens after login. It polls active booking detail so background worker progress appears without a page reload.

### PostgreSQL

PostgreSQL stores users, token hashes, sessions, conversations, messages, bookings, offers, approvals, jobs, provider attempts, checkout handoffs, and audit events. It also acts as the durable queue, keeping deployment simpler and preserving transactional consistency with booking state.

Offer refreshes preserve the persisted UUID for the same provider/external ID. Superseded rows referenced by historical approvals are retained as non-current audit evidence and excluded from new offer lists.

## Package boundaries

### `@flow/contracts`

The canonical runtime and compile-time data model. Contracts use strict Zod objects, ISO timestamps, integer minor-unit money, ISO currency codes, bounded arrays, and UUIDs.

### `@flow/core`

Pure domain logic:

- booking state transitions;
- canonical JSON and offer fingerprints;
- approval enforcement;
- currency-safe money operations;
- deterministic deal ranking;
- public coupon normalization and prioritization;
- adjacent seat-group scoring.

It has no database, network, browser, or AI dependency.

### `@flow/db`

The `FlowStore` port and PostgreSQL implementation. SQL is parameterized. Migrations are ordered, checksummed, and immutable after application.

### `@flow/providers`

The provider port and adapters. Every adapter declares:

- supported booking categories;
- search availability;
- checkout availability;
- coupon-validation availability;
- scheduling compatibility.

The registry searches independent providers concurrently and returns per-provider diagnostics instead of failing the entire booking when one provider is unavailable.

### `@flow/ai`

Contains two bounded OpenAI workflows:

- the conversational booking agent, which can call only five safe domain tools;
- public coupon research, which uses web search and structured output.

Neither workflow can approve a booking or invoke checkout directly.

### `@flow/runtime`

Coordinates stores and providers. `BookingService` owns the booking lifecycle; `WorkerEngine` owns leases, retries, and process polling.

## Booking lifecycle

The allowed state graph is explicit:

```text
draft ---------> searching
scheduled -----> searching
failed --------> searching

searching -----> options_ready -----> awaiting_approval -----> approved
    |                    |                      ^                   |
    +----> scheduled     +----> searching      +---- rollback ----+
                                                                  |
                                                                  +----> executing
                                                                            |
                                                       +--------------------+--------------------+
                                                       |                    |                    |
                                                    booked       awaiting_user_action         failed
```

Cancellation and expiry edges exist only where the transition is safe. Terminal confirmations cannot be reopened.
An invalid execution preflight moves `approved` to `failed`; a failure to enqueue the execution job revokes the approval and rolls `approved` back to `awaiting_approval`.
Once approved, a stale research or edit request cannot move the booking back to `searching`.

### Research

1. Load the user-owned booking.
2. Reject execution-protected or expired states.
3. Transition to `searching` under a database lock.
4. Search compatible enabled providers concurrently.
5. Optionally research public coupon candidates using a privacy-reduced booking summary.
6. Normalize offers and attach sourced deal evidence.
7. Filter typed hard constraints and deterministically rank eligible offers. Free-text requirements remain adapter-specific notes.
8. Replace current offers in one database transaction.
9. Transition to `options_ready`, or back to `scheduled` if only deferred/no results exist.
10. Schedule the next refresh before the deadline.

### Selection and approval

Selection records the exact offer ID and moves `options_ready` to `awaiting_approval`. Approval then persists:

- booking, user, offer, and provider IDs;
- SHA-256 fingerprint of material offer fields;
- maximum charge and currency;
- absolute expiry;
- optional not-before and not-after bounds;
- the user's confirmation statement.

The approval is single-use. Creating it schedules one execution job keyed by the approval ID.

### Execution

1. Require state `approved`.
2. Load selected offer and active approval.
3. Recompute and compare the offer fingerprint.
4. Enforce provider, currency, amount, expiry, and execution window.
5. Transition to `executing`.
6. Rank a bounded set of unique public coupons, but only if the provider advertises coupon validation.
7. Ask the provider to prepare checkout.
8. Require the response provider and actual final total to match the approval envelope.
9. Consume the approval after the provider is invoked, preventing replay.
10. Transition to `booked`, `awaiting_user_action`, or `failed` and write an audit event.

Provider exceptions and unverifiable totals fail closed. A provider-side failure after invocation also consumes the one-time approval because the external side effect may be ambiguous.

## Concurrency and consistency

- Booking status changes lock the booking row and validate the state transition inside the transaction.
- Research results compare the post-transition `updatedAt` token before expensive deal research and again before persistence; stale runs return without replacing newer offers.
- Offer selection verifies ownership through the parent booking.
- One partial unique index permits only one active approval per booking.
- One partial unique index enforces job idempotency.
- Worker leases bound abandoned-job recovery.
- Active workers extend their leases at one-third of the lease interval while provider work is running.
- Completion and failure updates require the same worker lease owner, so a stale worker cannot overwrite a reclaimed job.
- API message `clientMessageId` values provide chat retry idempotency.
- Provider search uses `Promise.allSettled`; isolated provider failures become diagnostics.
- Checkout is deliberately not retried blindly. A failed external call may have reached the provider, so the approval is consumed and the booking requires explicit recovery.

## Extension points

Add a provider by implementing `BookingProvider`, declaring honest capabilities, registering it in `createProviderRegistry`, and writing contract tests for normalization and price verification. New checkout adapters must return the provider's actual final total; using the search-page price as a checkout total is not accepted.

Add a queue backend only if PostgreSQL leasing becomes a measured bottleneck. The current boundary is encapsulated by `FlowStore`, but keeping booking transitions and job state transactional should remain a requirement.
