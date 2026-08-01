# UiPath Ticket Booking Bot integration

Flow supports a sanitized, published derivative of [`Haritha-Sivasankaran/Ticket_Booking_Bot`](https://github.com/Haritha-Sivasankaran/Ticket_Booking_Bot) through UiPath Orchestrator.

The integration intentionally does not clone or execute the original workflow locally. The inspected upstream revision contains machine-specific paths and embedded credential material. Treat any exposed credential as compromised, rotate it, remove it from every workflow and history you control, and never publish the project unchanged.

## Upstream revision

The adapter was mapped against:

```text
aed1a11829e5e876d8bd5ad01edc4772a4c66ebc
```

The upstream project is MIT-licensed at that revision.

## Sanitization checklist

Before publishing to your tenant:

1. Remove embedded email, SMTP, application, and provider credentials.
2. Rotate credentials that were ever committed or shared.
3. Replace machine-specific filesystem paths with workflow arguments or managed storage.
4. Replace local browser/profile assumptions with tenant-safe assets.
5. Move secrets to UiPath Assets or your secret manager.
6. Remove automatic outbound email unless it is explicitly required and reviewed.
7. Validate selectors against authorized accounts in a non-production folder.
8. Ensure the process performs discovery/export only; do not add autonomous payment.
9. Publish the sanitized package and record its release key.

## Configuration

All values are required together:

```dotenv
FLOW_UIPATH_BASE_URL=https://cloud.uipath.com/<org>/<tenant>/orchestrator_
FLOW_UIPATH_ACCESS_TOKEN=...
FLOW_UIPATH_FOLDER_ID=...
FLOW_UIPATH_RELEASE_KEY=...
```

Use a least-privilege token able to start only the intended process in the intended folder. Store it in a secret manager in production.

## API mapping

Flow starts one modern job with:

```text
POST {baseUrl}/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs
Authorization: Bearer <token>
X-UIPATH-OrganizationUnitId: <folder id>
```

`InputArguments` is a JSON string, matching the Orchestrator API contract. Flow preserves the original subworkflow argument names:

| Category | Inputs                                       |
| -------- | -------------------------------------------- |
| Flight   | `source`, `destination`, `date1`, `email`    |
| Train    | `source1`, `destination1`, `date2`, `email1` |

The email value is included only when `intent.metadata.contactEmail` is explicitly supplied; otherwise it is empty.

## Result behavior

Starting a job returns a deferred provider run with its Orchestrator job key/ID and queued/running status. The current adapter does not poll exported files back into normalized `Offer` rows and does not support checkout. Live Trip.com `webcmd` search can provide normalized flight/train offers in parallel.

To make UiPath output first-class, add a separate result-ingestion worker that polls the job, validates a versioned JSON export, normalizes prices/currencies, and attaches evidence. Do not scrape email output or infer checkout completion.

## Failure behavior

- Partial configuration fails Flow startup.
- Network calls have a 30-second timeout.
- HTTP 429 and 5xx responses are marked retryable.
- Missing job references are failures.
- Response bodies are truncated before inclusion in errors.
- The provider advertises `checkout: false` and `couponApplication: false`.
