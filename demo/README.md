# Flow demo gallery

Screenshots and viral walkthrough video from a live local Flow session (Apple-style UI, offline planner).

## Quick tour

1. `cp .env.example .env && npm install && npm run db:migrate && npm run db:seed && npm run dev`
2. Open http://localhost:5173
3. From **Travel, clarified.** search Tokyo → Seoul (or any route) and tap **Search flights**
4. Compare ticket offers in **Bookings**, select, and approve checkout

Regenerate assets (API + web must be running):

```bash
npm run demo:capture   # screenshots + simple recording
npm run demo:viral     # cursor + spotlight + zoom-into-feature video
```

## Assets

| File | Description |
| --- | --- |
| [screenshots/01-hero.png](./screenshots/01-hero.png) | Travel, clarified. hero |
| [screenshots/05-bookings.png](./screenshots/05-bookings.png) | Bookings + tickets |
| [screenshots/06-tickets.png](./screenshots/06-tickets.png) | Ticket detail |
| [flow-viral-demo.mp4](./flow-viral-demo.mp4) | Viral demo (zooms + captions) |
| [flow-viral-demo.webm](./flow-viral-demo.webm) | Same (WebM) |
| [flow-demo.mp4](./flow-demo.mp4) | Alias of the viral demo |
| [viral-beats/](./viral-beats/) | Key stills used in the edit |

## Viral demo beats

Title → zoom headline → search panel → type route → Search flights → ticket zoom → select / sort / approve → end card.
