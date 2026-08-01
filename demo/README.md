# Flow demo gallery

Screenshots and a walkthrough video captured from a live local session.

## Quick tour

1. `npm install && npm run dev`
2. Open http://localhost:3000 — the **setup wizard** opens on first visit
3. Choose **macOS** or **Windows**, copy install commands through **Webcmd** and **Accounts**
4. On Accounts, use in-app **Link** / **Demo link**, or connect via **Composio MCP** in Cursor
5. Click **Enter Flow**
6. Try a suggestion like `Tokyo flights under $650 next month`
7. Review deal cards; click **Run `webcmd list`** in the Webcmd panel

Regenerate assets anytime (server must be running):

```bash
npm run demo:capture
```

## Assets

| File | Description |
|------|-------------|
| [screenshots/01-hero.png](./screenshots/01-hero.png) | Brand hero + suggestions |
| [screenshots/02-setup-wizard.png](./screenshots/02-setup-wizard.png) | Setup dialog welcome |
| [screenshots/02b-setup-os.png](./screenshots/02b-setup-os.png) | macOS / Windows / Linux picker |
| [screenshots/02c-setup-accounts.png](./screenshots/02c-setup-accounts.png) | Accounts + Composio MCP instructions |
| [screenshots/03-deals.png](./screenshots/03-deals.png) | Chat with ranked deal cards |
| [screenshots/04-accounts-webcmd.png](./screenshots/04-accounts-webcmd.png) | Accounts + webcmd panels |
| [flow-demo.mp4](./flow-demo.mp4) | Product walkthrough |
| [flow-demo.webm](./flow-demo.webm) | Same walkthrough (WebM) |

## Composio MCP (Cursor)

1. Enable the Composio MCP server in Cursor
2. Ask: “Connect my Gmail account with Composio”
3. Open the auth link and finish OAuth
4. Refresh Flow’s Accounts panel (or re-open Setup → Accounts)

With `COMPOSIO_API_KEY` in `.env.local`, Flow’s in-app **Link** buttons start the same OAuth flow.
