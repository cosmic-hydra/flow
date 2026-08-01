# webcmd providers

Flow uses [`@agentrhq/webcmd`](https://www.npmjs.com/package/@agentrhq/webcmd) as a typed command boundary around supported booking sites. The CLI is invoked directly with argument arrays, never through a shell.

## Installation

```bash
npm install -g @agentrhq/webcmd
webcmd --version
```

Flow has been developed against 0.5.2. Configure:

```dotenv
FLOW_ENABLE_WEBCMD=true
FLOW_WEBCMD_PATH=webcmd
FLOW_WEBCMD_PROFILE=flow
FLOW_WEBCMD_TIMEOUT_MS=45000
```

The CLI profile isolates Flow's site sessions from other webcmd use.

## District

Authenticate interactively when checkout is needed:

```bash
webcmd --profile flow district login --window foreground
webcmd --profile flow district whoami -f json
```

Flow uses:

- `district showtimes` for movie inventory;
- `district search` for dining, events, stores, activities, and generic discovery;
- `district seats` for real seat-map inventory;
- `district checkout --payment review` for seat selection and order review.

The checkout command stops at review/payment handoff. Flow ranks the available seat groups deterministically, then requires the returned checkout response to expose a final total. That total—not the earlier listing—is checked against the approval ceiling.

The installed adapter does not expose a coupon-entry option, so `couponApplication` remains false. Public deals can still be shown as evidence, but Flow will not claim to have validated them.

## Trip.com

Flow maps:

- `trip search` to airport/city resolution;
- `trip flight` and `flight-round` to flight discovery;
- `trip train` to supported-country train discovery;
- `trip attraction` to activities;
- `trip car` to rental inventory;
- `trip deals` to current promotion evidence.

Trip.com commands are discovery-only in the current webcmd surface. Flights require resolvable IATA codes. Train search currently supports the built-in country mapping for GB, FR, IT, ES, DE, and CN; other routes can provide `intent.metadata.countrySlug` through the API.

## Booking.com

`booking search` supplies hotel cards for a destination and check-in/check-out range. Flow passes adults, rooms, children, and requested currency. The result is search-only and may not include final taxes or property charges; checkout authority is never inferred from it.

## Operational notes

- Run API/worker on the host that owns the authenticated browser profile.
- Keep browser-provider concurrency conservative.
- Site sessions can expire; check the Providers screen and re-authenticate interactively.
- Provider pages can change without notice. Treat parsing failures as adapter health incidents.
- Browser traces are retained only for write-command failures by default.
- Do not place login credentials, cookies, or payment data in booking metadata.
- Respect provider terms, inventory rules, and rate limits.

## Adding a webcmd command

Add a provider method using `WebcmdRunner.runJson`. Site, command, and option keys are validated; still use only static adapter-owned values for them. Parse output through the shared safe readers, normalize money to minor units, keep raw payload bounded, and return an honest capability declaration.
