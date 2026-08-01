# Security policy

## Supported version

Flow is pre-1.0. Security fixes target the current `main` branch.

## Reporting

Do not open a public issue for a vulnerability involving authentication, checkout authority, provider sessions, coupon abuse, credential exposure, or personal data.

Contact the repository owner privately through the security-reporting channel configured on GitHub. Include:

- affected commit;
- reproducible steps using demo data where possible;
- expected and actual impact;
- whether a provider or payment flow was invoked;
- suggested mitigation.

Do not access data that is not yours, complete a real purchase, bypass provider controls, enumerate coupon codes, or retain secrets while researching a report.

## Scope priorities

Highest-priority issues include:

- checkout without a valid user approval;
- approval replay or cross-booking/provider use;
- currency or price-ceiling bypass;
- raw token/session/payment leakage;
- SQL or command injection;
- cross-user booking access;
- malicious provider output leading to code execution;
- unsafe automatic retry after ambiguous checkout.

## Operational incidents

If a secret is committed or exposed, revoke and rotate it first. Removing it from the latest commit is not sufficient. Preserve only sanitized evidence needed for investigation.
