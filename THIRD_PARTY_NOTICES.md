# Third-party notices

Flow depends on third-party packages listed in `package-lock.json`. Retain their license notices when redistributing a built artifact.

## Requested integrations

### @agentrhq/webcmd

- Project: [`@agentrhq/webcmd`](https://www.npmjs.com/package/@agentrhq/webcmd)
- Integrated version: 0.5.2 during development
- Use: external CLI for District, Trip.com, and Booking.com provider commands
- Distribution: not vendored by this repository

Review the package's published license and the terms of every connected site before redistribution or operation.

### krushiraj/bms-bot

- Project: [`krushiraj/bms-bot`](https://github.com/krushiraj/bms-bot)
- Pinned commit: `63e78ca0cbbf4c9bf21819ade4d4f43ab0085dfe`
- Use: optional external movie-seat checkout preparation
- Distribution: not vendored; installed into an ignored external directory

The inspected package metadata declares MIT. The pinned repository revision does not contain a root license file. Confirm licensing with the upstream maintainer before redistribution or production use.

### Haritha-Sivasankaran/Ticket_Booking_Bot

- Project: [`Haritha-Sivasankaran/Ticket_Booking_Bot`](https://github.com/Haritha-Sivasankaran/Ticket_Booking_Bot)
- Inspected commit: `aed1a11829e5e876d8bd5ad01edc4772a4c66ebc`
- License: MIT in the upstream repository
- Use: argument-compatible adapter for a sanitized, user-published UiPath Orchestrator process
- Distribution: no upstream XAML or source is copied into Flow

Do not execute or republish the upstream workflow unchanged. Sanitize machine-specific paths and credential material and rotate exposed credentials first.

## OpenAI

Flow uses the official `openai` JavaScript SDK and the Responses API for opt-in conversational planning and public deal research. API use is governed by the applicable OpenAI terms and policies.

## Provider names

BookMyShow, District, Zomato, Trip.com, Booking.com, UiPath, and other provider names are trademarks of their respective owners. Flow is not affiliated with or endorsed by those providers.
