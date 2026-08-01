# Contributing

## Standards

- Preserve strict TypeScript and exact optional property semantics.
- Keep domain logic pure and provider-neutral.
- Validate all external input at a boundary.
- Represent money as integer minor units plus ISO currency.
- Declare provider capabilities honestly.
- Never add an AI approval or purchase tool.
- Never log credentials, cookies, raw tokens, private coupon codes, or payment data.
- Avoid broad rewrites and unrelated dependency additions.

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Run the full gate before opening a pull request:

```bash
npm run verify
npm audit
```

## Changes by area

### Domain contracts

Change `@flow/contracts` first, then update core, persistence mapping, API, and UI. Add migrations for persisted schema changes. Never edit an applied migration.

### Booking states

Update the explicit state graph and tests. Explain recovery semantics for failure and cancellation. Checkout-related transitions require a threat-model review.

### Providers

Implement `BookingProvider`, add it to the registry, and test:

- supported categories and capability flags;
- unavailable/disabled health behavior;
- malformed and oversized provider output;
- price/currency normalization;
- hard-constraint mapping;
- final checkout total verification;
- safe handoff when payment authentication is required.

Search must be side-effect-free from Flow's perspective. Checkout requires a valid approval. Do not advertise coupon application when the provider cannot report acceptance/rejection.

### AI tools

Use structured schemas and deterministic application code. Keep tools narrow, observable, and non-authoritative for spending. Add an evaluation fixture for prompt changes that affect booking creation or offer selection.

### UI

Preserve explicit demo labels, approval boundaries, provider capability distinctions, and error states. A visual shortcut must not blur research, approval, and execution.

## Pull requests

Include:

- problem and root cause;
- architecture and tradeoffs;
- security and privacy impact;
- migration/deployment impact;
- test evidence;
- provider screenshots or sanitized traces when relevant.

Never attach authenticated browser traces, live tokens, payment screens, or personal booking data.
