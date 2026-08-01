# BMS Bot integration

Flow integrates [`krushiraj/bms-bot`](https://github.com/krushiraj/bms-bot) as optional external automation for BookMyShow-style movie-seat preparation. Upstream source is not copied into this repository.

## Revision

The bootstrap script pins commit:

```text
63e78ca0cbbf4c9bf21819ade4d4f43ab0085dfe
```

Pinning makes upgrades reviewable and reproducible. The script verifies the remote and revision and refuses to replace a modified directory.

## Install

```bash
npm run integration:bms:install
```

By default the checkout is placed under `.flow/integrations/bms-bot`, which is ignored by Git. The command prints the path to place in `.env`:

```dotenv
FLOW_BMS_BOT_PATH=/absolute/path/to/flow/.flow/integrations/bms-bot
FLOW_BMS_BOT_TIMEOUT_MS=180000
FLOW_BMS_BOT_HANDOFF_TTL_MS=600000
```

You can set `FLOW_BMS_INSTALL_PATH` before running the bootstrap script to choose a different external directory.

## How Flow uses it

1. Live movie/show discovery comes from the District `webcmd` adapter.
2. Flow normalizes those results under provider ID `bms-bot`.
3. The user selects an offer and creates a bounded approval.
4. At the scheduled time, Flow launches the pinned upstream `BookingFlow` through `integrations/bms-bot/bridge.ts`.
5. The bridge supplies movie, city, theatre, time, date, format/language, party size, and seat preferences.
6. Gift-card input is always empty.
7. Upstream automation chooses seats and stops at its payment step.
8. Before cleanup, the bridge reads the exact visible `Amount Payable` label and current HTTPS handoff URL when the pinned upstream result omits them.
9. Flow requires a finite positive total, converts it to minor units, and enforces the approval ceiling.
10. The booking becomes `awaiting_user_action`; the user reviews and completes payment in the visible provider browser.

The bridge emits its verified result immediately, then keeps the visible payment window alive for the bounded `FLOW_BMS_BOT_HANDOFF_TTL_MS` period (10 minutes by default) or until the page is closed. The worker can persist the handoff without waiting for that window to expire. The bridge does not accept a generic subtotal and fails closed when the payable amount cannot be verified. The child process is spawned without a shell, has a hard preparation timeout and 10 MiB output limit, and communicates its final structured result through a unique line prefix.

## Contact fields

The upstream configuration supports email and phone. Flow reads them only from explicit booking metadata keys `contactEmail` and `contactPhone`; the structured web form collects both as optional provider-only fields. They are excluded from public coupon research. Avoid placing sensitive contact information in shared logs or test fixtures.

## Limitations

- Browser state and provider UI changes can break automation.
- The bridge does not validate public coupon codes; capability is false.
- CAPTCHA, OTP, login, provider risk controls, and payment remain user/provider concerns.
- Flow treats a missing final total as failure even if the browser reached a payment page.
- Upstream result types are not a stable public API, so pin and test upgrades.

## Licensing and review

The inspected upstream package metadata declares MIT, but the pinned revision does not contain a root license file. Confirm the applicable license and your authorization before use. Review upstream source, dependencies, site terms, and browser behavior. Run it with a dedicated low-privilege account and isolated profile.

To upgrade, change the pinned commit in `scripts/bootstrap-bms-bot.sh`, update `THIRD_PARTY_NOTICES.md`, inspect the complete diff, reinstall, and run a low-value payment-handoff test.
