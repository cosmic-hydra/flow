# Flow demo gallery

This folder documents how to use Flow end-to-end.

## Walkthrough

1. Start the app: `npm run dev`
2. Open http://localhost:3000 — the **setup wizard** appears on first visit
3. Choose **macOS** or **Windows**, copy install commands, continue through **Webcmd** and **Accounts**
4. Click **Enter Flow**
5. Ask: `Tokyo flights under $650 next month`
6. Review ranked deal cards; open a provider link
7. Use the right rail to link Gmail / Calendar via Composio, or open **Setup** again
8. In **Webcmd**, click **Run `webcmd list`** to verify adapters

## Assets

| File | Description |
|------|-------------|
| `screenshots/01-hero.png` | Brand hero + suggestions |
| `screenshots/02-setup-wizard.png` | OS setup dialog |
| `screenshots/03-deals.png` | Chat with deal cards |
| `screenshots/04-accounts-webcmd.png` | Accounts + webcmd panels |
| `flow-demo.mp4` | Short product walkthrough |

Screenshots and video are generated from a live local session (see repo root README).

## Composio MCP (Cursor)

1. Ensure the Composio MCP server is enabled in Cursor
2. Ask the agent: “Connect my Gmail account with Composio”
3. Open the auth link, complete OAuth
4. Refresh Flow’s Accounts panel — or re-run setup — to see linked toolkits
