# Provider integrations

| Provider                      | Categories                                            | Search                          | Checkout                     | Coupon validation | Notes                                    |
| ----------------------------- | ----------------------------------------------------- | ------------------------------- | ---------------------------- | ----------------- | ---------------------------------------- |
| Flow Demo                     | all                                                   | simulated                       | simulated                    | yes, simulated    | Deterministic local fixtures             |
| District via `webcmd`         | movie, restaurant, event, activity, shopping, generic | live                            | movie review/payment handoff | no                | Ranks real seat inventory before handoff |
| Trip.com via `webcmd`         | flight, train, activity, rental                       | live                            | no                           | no                | Also gathers live promotion evidence     |
| Booking.com via `webcmd`      | hotel                                                 | live                            | no                           | no                | Search-page pricing                      |
| `krushiraj/bms-bot`           | movie                                                 | live discovery through District | payment-step handoff         | no                | Optional pinned external bridge          |
| Ticket Booking Bot via UiPath | flight, train                                         | asynchronous workflow           | no                           | no                | Requires sanitized published release     |

Capability declarations are part of the safety boundary. Do not set `checkout` or `couponApplication` to true until the adapter can observe and validate the corresponding provider state.

Provider failures are isolated during search. Checkout is single-provider and therefore fails the booking when its invariant cannot be verified.

- [webcmd](webcmd.md)
- [BMS Bot](bms-bot.md)
- [UiPath Ticket Booking Bot](uipath.md)
