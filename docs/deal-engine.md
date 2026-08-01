# Deal and coupon engine

## Objectives

“Best” is not synonymous with the smallest displayed number. Flow ranks eligible offers by total listed price, typed constraint fit, user preferences, quality signals, and evidence-backed savings. Typed hard constraints are filters; soft preferences influence score. Free-text requirement lines are provider-aware notes and are not treated as deterministically satisfied unless an adapter supplies explicit evidence.

Prices are represented as integer minor units and never compared across currencies. Search adapters that cannot see final checkout fees retain a listed-price interpretation. The live checkout adapter must later return the actual total, which is checked against the user's approval ceiling.

## Offer normalization

Every provider result becomes an `Offer` with:

- provider and external identifiers;
- title, timing, availability, and URL;
- base price, fees, taxes, savings, and final price;
- refundability and typed attributes;
- deal evidence;
- fetch and optional expiry timestamps.

Provider payloads remain in `attributes` for diagnostics, but scoring reads only explicit, bounded fields.

## Eligibility

An offer is removed before scoring when any of these apply:

- its provider is excluded;
- its currency differs from the booking budget;
- its total exceeds the budget;
- known inventory cannot cover the party size;
- its known start time falls outside the requested window;
- stops, carrier, baggage, or refundability violate typed travel constraints;
- rating, amenities, or refundability violate typed lodging constraints;
- its verified unit price exceeds a per-seat ceiling.

When a typed hard constraint requires provider evidence and that evidence is absent, the offer is excluded rather than silently treated as a match. Provider adapters also encode category-specific constraints when querying inventory. Seat adjacency, row, class, and accessibility constraints receive an additional deterministic ranking pass at checkout.

## Scoring

The default score is a weighted average on a 0–100 scale:

| Dimension     | Weight | Meaning                                                           |
| ------------- | -----: | ----------------------------------------------------------------- |
| Price         |     45 | Relative price within the same currency                           |
| Preferences   |     30 | Provider, refundability, stop, carrier, rating, and adjacency fit |
| Quality       |     15 | Normalized provider rating or conservative fallback               |
| Deal evidence |     10 | Confidence and verification evidence for attached offers          |

Price normalization is performed independently by currency. Ties resolve by final amount, provider ID, and external ID, producing stable order for the same normalized input.

Weights are domain options, not AI output. Change them only with representative evaluation fixtures.

## Public coupon research

When `OPENAI_API_KEY` and `FLOW_ENABLE_WEB_DEAL_RESEARCH=true` are configured, one bounded Responses API request searches the public web for relevant codes. The request receives only:

- booking category and query;
- candidate provider IDs;
- broad city/market;
- booking date;
- currency.

Contact details, conversation history, account data, and payment information are excluded.

Structured output accepts at most 20 candidates. Flow discards entries that lack an HTTPS source, name an unknown provider, have an invalid code shape, are expired, or are marked non-public. Web evidence is not labeled verified; it becomes a candidate for provider-side validation.

## Attempt policy

At execution, candidates are:

1. restricted to the selected provider;
2. restricted to public codes;
3. validated against a conservative code character set;
4. removed when expired;
5. de-duplicated case-insensitively;
6. ranked by expected savings multiplied by confidence;
7. capped by both the booking plan and operator maximum.

No enumeration, mutation, dictionary generation, or guessing occurs. Flow does not attempt leaked, account-specific, referral, employee, or single-use codes.

Candidates are passed only when the adapter declares `couponApplication: true`. An adapter should try candidates sequentially, stop after the best accepted result according to its documented policy, and return its actual final checkout total. Current live `webcmd` commands expose promotions but not coupon entry, so those adapters honestly declare the capability false. The deterministic demo provider implements sequential rejection/application for end-to-end testing.

## Price safety

Deal application may lower the checkout total; it may never expand authority. After provider checkout preparation, Flow rejects:

- provider mismatch;
- currency change;
- missing or unverifiable total;
- total greater than the approved maximum;
- explicit provider failure.

The approval is one-time and consumed after any provider invocation because an ambiguous external result must not be replayed automatically.

## Adding a coupon-capable adapter

An adapter must:

- advertise `couponApplication: true` only when it can observe provider validation;
- accept only the supplied bounded candidates;
- avoid retrying the same normalized code;
- distinguish rejected, ineligible, transient-error, and applied outcomes internally;
- stop before payment if the site requires user action;
- return the actual post-discount, post-fee total;
- exclude raw payment credentials and private promotion data from logs.
