# Flow demo gallery

Screenshots and a walkthrough video captured from a live local session of the Iceland-inspired workspace.

## Quick tour

1. `cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev`
2. Open http://localhost:5173 — the **setup wizard** opens on first visit
3. Choose **macOS** or **Windows**, copy install commands through **Runtime**, **Webcmd**, and **Accounts**
4. On Accounts, use in-app **Link** / **Demo**, or connect via **Composio MCP** in Cursor
5. Click **Enter Flow**
6. From the full-bleed hero, pick a suggestion (or tap **Order**) and send
7. Open **Accounts** in the sidebar to inspect Composio links and run `webcmd list`

Regenerate assets anytime (API + web must be running):

```bash
npm run demo:capture
```

## Assets

| File                                                                       | Description                          |
| -------------------------------------------------------------------------- | ------------------------------------ |
| [screenshots/01-hero.png](./screenshots/01-hero.png)                       | Full-bleed brand hero                |
| [screenshots/02-setup-wizard.png](./screenshots/02-setup-wizard.png)       | Setup dialog welcome                 |
| [screenshots/02b-setup-os.png](./screenshots/02b-setup-os.png)             | macOS / Windows / Linux picker       |
| [screenshots/02c-setup-accounts.png](./screenshots/02c-setup-accounts.png) | Accounts + Composio MCP instructions |
| [screenshots/03-chat.png](./screenshots/03-chat.png)                       | Concierge chat                       |
| [screenshots/04-accounts-webcmd.png](./screenshots/04-accounts-webcmd.png) | Accounts + webcmd panels             |
| [screenshots/05-bookings.png](./screenshots/05-bookings.png)               | Bookings workspace                   |
| [flow-demo.mp4](./flow-demo.mp4)                                           | Product walkthrough                  |
| [flow-demo.webm](./flow-demo.webm)                                         | Same walkthrough (WebM)              |

## Composio MCP (Cursor)

1. Enable the Composio MCP server in Cursor Settings → MCP
2. Ask: “Connect my Gmail account with Composio”
3. Open the auth link and finish OAuth
4. Refresh Flow’s **Accounts** view (or re-open Setup → Accounts)

With `COMPOSIO_API_KEY` in `.env`, Flow’s in-app **Link** buttons start the same OAuth flow.
