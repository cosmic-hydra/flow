# Flow

Flow is an approval-safe AI booking concierge. Describe a movie, flight, train, hotel, restaurant, event, rental, appointment, product, or service; Flow converts the request into a durable booking plan, searches configured providers, gathers public deal evidence, ranks total-value options, and schedules execution for the right time.

The system deliberately separates research from spending. The AI can create requests, search inventory, compare offers, and select an option for review. It cannot approve a charge. Checkout requires a short-lived user approval locked to the exact booking, provider, offer fingerprint, currency, maximum amount, and execution window.

## What is implemented

- Conversational planning with the OpenAI Responses API and strict function tools.
- Structured booking for 13 categories with budgets, route, date window, party size, seat preferences, lodging preferences, and hard constraints.
- Durable PostgreSQL jobs for immediate research, periodic refreshes, and future execution.
- Multi-provider search through `webcmd` for District, Trip.com, and Booking.com.
- A clean external bridge for `krushiraj/bms-bot` movie-seat checkout.
- A sanitized UiPath Orchestrator bridge compatible with the flight/train inputs in `Haritha-Sivasankaran/Ticket_Booking_Bot`.
- Public coupon discovery through OpenAI web search, with source URLs and bounded candidate counts.
- Deterministic offer scoring across typed constraints, preferences, price, quality, and deal evidence.
- Sequential coupon handling only for adapters that truthfully advertise coupon validation support. The demo adapter exercises this flow end to end; current live `webcmd` adapters do not expose coupon entry.
- Seat-group ranking for adjacency, center position, row avoidance, class preference, accessibility, and per-seat budget.
- Explicit approval envelopes, one-time consumption, immutable audit events, idempotent jobs, rate limits, redacted logs, and fail-closed price verification.
- A responsive React workspace for chat, advanced seat/travel/stay constraints, offer comparison, approvals, schedules, provider health, durable checkout handoffs, and activity history.
- OpenAPI documentation at `/docs`, Docker packaging, and CI.

## Reality boundary

Flow is a production-oriented orchestration foundation, not a claim that every website exposes safe automated checkout.

- `demo` is deterministic simulated inventory and simulated confirmation. It is visibly labeled.
- District movie search and seat checkout use the installed `webcmd` adapter. Checkout stops at review/payment handoff.
- Trip.com and Booking.com adapters provide live discovery, not checkout.
- `bms-bot` is optional and runs as an external, pinned checkout bridge. Flow stops at its payment step and keeps the visible handoff window open for a bounded completion period.
- The UiPath integration starts a sanitized flight/train discovery workflow asynchronously. It does not purchase tickets.
- Payment authentication, CAPTCHA, provider terms, regional availability, logged-in sessions, and inventory changes can require user action.
- A sourced coupon is a candidate, not a promise. Only a provider-side validation result counts as applied.

## Architecture

The repository is an npm-workspaces monorepo:

```text
apps/
  api/          Fastify HTTP API, auth, chat, OpenAPI
  worker/       Durable research, refresh, and execution worker
  web/          React and Vite booking workspace
packages/
  ai/           Responses API agent and web coupon researcher
  config/       Strict environment parsing and production guards
  contracts/    Shared Zod schemas and TypeScript types
  core/         State machine, approvals, ranking, money, coupons, seats
  db/           PostgreSQL store, migrations, job leasing, audit log
  providers/    Demo, webcmd, BMS Bot, and UiPath adapters
  runtime/      Booking orchestration and worker engine
integrations/
  bms-bot/      Clean-room external process bridge
```

The API and worker are separate processes. PostgreSQL is both the system of record and durable queue; workers claim jobs with leases and row locking, so no Redis dependency is required. See [Architecture](docs/architecture.md) for the detailed lifecycle.

## Quick start

Requirements:

- Node.js 22.12 or newer
- npm 11 or newer
- PostgreSQL 15 or newer
- `webcmd` 0.5.2 or newer for live web discovery

Install and configure:

```bash
git clone https://github.com/cosmic-hydra/flow.git
cd flow
cp .env.example .env
npm install
npm install -g @agentrhq/webcmd   # or use ./node_modules/.bin/webcmd
```

Start PostgreSQL, then run:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Development mode provisions a local user automatically. The **setup wizard** opens on first visit with Windows / macOS / Linux install commands, webcmd health, and Composio account linking. The API listens on `http://localhost:4010`.

`npm run dev` starts the API, worker, and web app together. Keep the worker running: it performs scheduled searches and approved execution.

### First-run setup wizard

The in-app dialog walks through:

1. Platform picker (macOS, Windows, Linux) with copyable install commands
2. Node + PostgreSQL runtime
3. `webcmd` install, doctor, and District login
4. Account linking via **Composio MCP** or in-app OAuth / demo link
5. Enter Flow

See the [demo gallery](demo/README.md) for screenshots and a walkthrough video (`npm run demo:capture`).

### Docker demo

The container profile intentionally disables host-browser integrations and uses the functional demo provider:

```bash
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). Set `OPENAI_API_KEY` in the shell before startup to enable conversational planning and sourced web deal research. Without it, structured booking remains fully usable.

## Enable live providers

### webcmd

The global CLI is the preferred live discovery layer:

```bash
npm install -g @agentrhq/webcmd
webcmd --version
webcmd --profile flow district login --window foreground
```

Set `FLOW_ENABLE_WEBCMD=true`, `FLOW_WEBCMD_PATH=webcmd`, and `FLOW_WEBCMD_PROFILE=flow`. Run Flow on the host where the authenticated browser session is available. See [webcmd provider guide](docs/providers/webcmd.md).

### BookMyShow automation

Bootstrap the pinned external source without copying it into this repository:

```bash
npm run integration:bms:install
```

The command verifies the upstream remote and commit, refuses to overwrite modified directories, installs its dependencies, and prints the `FLOW_BMS_BOT_PATH` value. Review [BMS Bot integration](docs/providers/bms-bot.md) before enabling it.

### Flight and train UiPath workflow

Publish a sanitized copy of the upstream UiPath project to your own Orchestrator tenant, then configure all four `FLOW_UIPATH_*` values. Flow starts jobs using the upstream workflow's flight/train argument names and returns a deferred provider run. See [UiPath integration](docs/providers/uipath.md).

## OpenAI configuration

```dotenv
OPENAI_API_KEY=...
FLOW_OPENAI_MODEL=gpt-5.6-sol
FLOW_OPENAI_REASONING_EFFORT=medium
FLOW_ENABLE_WEB_DEAL_RESEARCH=true
```

Chat uses function tools that can create, search, inspect, list, and select bookings. There is intentionally no approval or purchase tool. Web deal research sends only the booking category, query, provider IDs, broad market, date, and currency—not contact details or payment data—and accepts only public codes with an HTTPS evidence URL.

## Composio accounts

Optional in-app OAuth for Gmail, Calendar, Slack, Notion, Outlook, and Stripe:

```dotenv
COMPOSIO_API_KEY=...
```

Without an API key, Flow still supports **demo linking** and documents **Composio MCP** setup for Cursor (`COMPOSIO_MANAGE_CONNECTIONS`). Linked accounts appear under the Accounts view and in the setup wizard.

## Approval and execution

1. Search adapters return normalized offers.
2. Flow filters typed hard constraints and scores eligible results deterministically; free-text requirements remain provider-dependent.
3. The user selects one offer.
4. The user reviews and approves a provider, offer fingerprint, currency, maximum charge, expiry, and optional execution start.
5. A one-time execution job runs at the approved time.
6. The provider may try a bounded ranked set of public coupon candidates if its adapter supports validation.
7. Flow compares the provider's actual final checkout total with the approval boundary.
8. The result is either confirmed, handed to the user for payment/authentication, or failed closed.

Validated handoffs persist the provider reference, actual total, selected seats, next action, and safe HTTPS continuation/receipt links so scheduled work remains actionable after the worker finishes.

Changing a material offer field invalidates the fingerprint. A currency change, hidden total, expired approval, provider mismatch, or amount above the ceiling is rejected.

## Authentication

Development uses `FLOW_AUTH_MODE=development`. Production requires token authentication and a session secret of at least 32 characters:

```dotenv
NODE_ENV=production
FLOW_AUTH_MODE=required
FLOW_SESSION_SECRET=<at-least-32-random-characters>
```

Create a user token:

```bash
npm run token:create -- \
  --email advaith@example.com \
  --display-name "Advaith" \
  --timezone Asia/Kolkata
```

The raw token is displayed once. The browser exchanges it for a strict, HTTP-only session cookie; only token hashes are stored.

## Commands

```bash
npm run dev                    # API + worker + web
npm run build                  # production artifacts
npm run verify                 # formatting, lint, types, tests, build
npm run db:migrate             # apply checksum-verified migrations
npm run db:seed                # create development user
npm run token:create -- ...    # create a production API token
npm run integration:bms:install
npm run demo:capture           # screenshots + walkthrough video (app must be running)
```

## API surface

- `GET /health/live`, `GET /health/ready`
- `GET /v1/meta`, `GET /v1/providers`, `GET /v1/setup/status`
- `GET|POST /v1/accounts` (Composio / demo account linking)
- `GET /v1/webcmd`, `POST /v1/webcmd/run`
- `POST /v1/auth/token`, `POST /v1/auth/logout`, `GET /v1/auth/me`
- `GET|POST /v1/conversations`
- `GET|POST /v1/conversations/:id/messages`
- `GET|POST /v1/bookings`
- `GET|PATCH /v1/bookings/:id`
- `POST /v1/bookings/:id/search`
- `POST /v1/bookings/:id/offers/:offerId/select`
- `POST /v1/bookings/:id/approve`
- `POST /v1/bookings/:id/cancel`

## Documentation

- [Architecture and lifecycle](docs/architecture.md)
- [Deal and coupon engine](docs/deal-engine.md)
- [Security model](docs/security.md)
- [Operations and deployment](docs/operations.md)
- [Provider integrations](docs/providers)
- [Demo gallery](demo/README.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing](CONTRIBUTING.md)

## Responsible use

Operate Flow only with accounts and providers you are authorized to use. Respect site terms, rate limits, anti-bot controls, ticketing rules, purchase limits, and local law. Do not use the coupon pipeline to enumerate codes, access private promotions, evade eligibility checks, or abuse referral programs.
