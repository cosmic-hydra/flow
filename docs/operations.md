# Operations

## Deployment modes

### Local host mode

Recommended when using `webcmd` or BMS Bot because those integrations depend on a local authenticated browser session. Run PostgreSQL separately and start `npm run dev` or the built API/worker processes under a supervisor.

### Container demo mode

`docker compose up --build` starts PostgreSQL, API, worker, and nginx web UI at port 8080. Browser integrations are disabled in this profile; deterministic demo inventory remains available.

### Production split mode

Build the `api`, `worker`, and `web` Dockerfile targets separately. Scale API and worker replicas independently. Keep at least one worker running. PostgreSQL leasing allows multiple workers, although checkout adapters may impose stricter per-account concurrency.

## Configuration

| Variable                        | Purpose                          | Default                 |
| ------------------------------- | -------------------------------- | ----------------------- |
| `NODE_ENV`                      | development, test, production    | `development`           |
| `FLOW_HOST` / `FLOW_PORT`       | API bind address                 | `127.0.0.1:4010`        |
| `FLOW_WEB_ORIGIN`               | exact allowed browser origin     | `http://localhost:5173` |
| `FLOW_DATABASE_URL`             | PostgreSQL URL                   | local `flow` database   |
| `FLOW_AUTH_MODE`                | development or required          | `development`           |
| `FLOW_SESSION_SECRET`           | session signing/config guard     | unset                   |
| `OPENAI_API_KEY`                | chat and optional deal research  | unset                   |
| `FLOW_OPENAI_MODEL`             | Responses API model              | `gpt-5.6-sol`           |
| `FLOW_ENABLE_WEB_DEAL_RESEARCH` | public coupon discovery          | `true`                  |
| `FLOW_ENABLE_WEBCMD`            | live webcmd providers            | `true`                  |
| `FLOW_BMS_BOT_PATH`             | pinned external BMS source       | unset                   |
| `FLOW_BMS_BOT_HANDOFF_TTL_MS`   | visible BMS payment-window lease | `600000`                |
| `FLOW_UIPATH_*`                 | complete Orchestrator connection | unset                   |
| `FLOW_WORKER_CONCURRENCY`       | jobs per poll                    | `4`                     |
| `FLOW_JOB_LEASE_SECONDS`        | abandoned-job lease              | `120`                   |
| `FLOW_MAX_COUPON_ATTEMPTS`      | operator-wide cap                | `8`                     |

All UiPath values are all-or-nothing. Partial configuration fails startup. Production without required authentication also fails startup.

## Database

Applications run migrations at startup, and operators can run them explicitly:

```bash
npm run db:migrate
```

Migration filenames are ordered. Applied checksums are recorded in `flow_migrations`; editing an applied migration causes startup to fail. Add a new migration instead.

Back up the database before schema upgrades. A production recovery test should verify bookings, approvals, jobs, and audit events together because they form one consistency boundary.

## Health and observability

- `/health/live` verifies that the API process serves requests.
- `/health/ready` verifies PostgreSQL connectivity.
- `/v1/providers` runs provider health checks and reports enabled and disabled adapters.
- JSON logs include job IDs, booking IDs, provider IDs, attempt counts, and bounded errors.
- Sensitive headers and token fields are redacted.
- Audit events record domain actions separately from operational logs.

Provider diagnostics are attached to research audit metadata. A booking can still succeed when one of several search providers fails.

## Worker behavior

The worker polls for due jobs, leasing up to its configured concurrency. When no full batch is returned it waits `FLOW_WORKER_POLL_MS`; shutdown interrupts that wait and drains active work.

Research jobs may retry through the job store. Checkout must not be blindly retried because an external provider call can have an ambiguous result. Flow consumes the approval and moves the booking to failed when checkout throws after invocation.

Monitor:

- queued jobs older than their `run_at`;
- repeatedly expired leases;
- provider failure rate by code;
- bookings stuck in `searching` or `executing`;
- approval expiry before scheduled execution;
- checkout price-ceiling failures;
- coupon research latency and cost.

## Scaling

Begin with one API and one worker. Increase API replicas for chat/read load and worker replicas for independent research load. Keep browser-backed provider concurrency lower than general research concurrency because authenticated sessions and provider tabs may not be safe to share.

PostgreSQL is sufficient until measured queue contention or job volume justifies a dedicated broker. If introducing one, preserve transactional idempotency between booking state and execution authority.

## Upgrades

1. Review application and third-party diffs.
2. Run `npm ci`, `npm audit`, and `npm run verify`.
3. Build all Docker targets.
4. Apply migrations in staging.
5. Exercise demo create/search/select/approve/execute.
6. Exercise each live provider through payment handoff with a low-value test.
7. Deploy API, then workers, then web.
8. Watch readiness, job lag, and provider diagnostics.

Never float external browser automation to an unreviewed branch. Update pinned commits intentionally and record the revision in `THIRD_PARTY_NOTICES.md`.
