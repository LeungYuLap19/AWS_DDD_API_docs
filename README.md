# AWS DDD API reference

Run `python -m http.server 8000` in this directory and open `http://localhost:8000`, or use the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/). Open [openapi.yaml](openapi.yaml) to save the contract for LLM tools and code generators. Choose an endpoint, fill its request fields on the left, and use **Send request** on the right. The preview follows those inputs and offers HTTP, Shell, Node, Ruby, and PHP examples. Success and error response structures are listed below the form. The specification uses OpenAPI 3.1 and YAML 1.2.

The 241 documented operations describe implemented routes, callers, and client rules. Five deferred routes and three preview/smoke routes are omitted. The contract covers subscriptions, placement sites, localized species/breed catalogs, public contacts, unified ownership events (including audited internal corrections), recovery image replacement and event-date filters, PTag location reports, and external adoption listings.

For frontend error handling, each operation lists the HTTP statuses its handlers return. Open a `4xx` response to see its JSON fields, the allowed `errorKey` values, and an example for each key. Branch on `errorKey`, not the localized `error` message. The `4XX` and `5XX` entries remain as fallbacks for gateway and unexpected responses. SF Express address payloads are passed through as provider-defined JSON because the Lambda does not validate their fields.

The published contract is [openapi.yaml](openapi.yaml). Local generation and audit scripts are excluded from Git.

Enter the deployed API ID, region, and stage in **Credentials** before sending. Supply the API key, bearer token, checkout token, or device signature required by the operation. Credentials stay in the browser tab and are masked in copied examples. The page loads js-yaml from jsDelivr, so viewing the interactive reference requires access to that CDN.

Browser requests from GitHub Pages use the origin `https://leungyulap19.github.io`. The deployed API must allow that origin, its request methods, and the headers required by the selected operation. In AWS_DDD_API, set the deployment's `AllowedOrigins` parameter; the production workflow supplies it through `PROD_ALLOWED_ORIGINS`.

PTag location reports provide public submission and protected pet-history/single-report reads.
Submission queues in-app, WhatsApp, and email through the shared outbox trigger. Inbox items
use `type: ptag_location_report`, `locationReportId`, and `evidence: null`; map URLs require
authorized report reads. Clients never supply notification recipients.

Deworm reminders use the recorded `nextDueDate` on that Asia/Hong_Kong calendar date, through
the shared in-app, email, and WhatsApp system. There are no advance or historical backlog reminders.
Clearing or correcting the due date suppresses stale queued sends; successful channels are not
resent when another channel retries. Notification contacts must be selected and verified.

SG development IAM removes default create/update for vaccine, deworm, general medical, medication,
and blood-test records from personal and NGO owner roles. History listing remains available.
NGO and clinic providers may write through an active pet-specific agreement granting the exact
operation. Ownership alone grants no clinical write access; internal operations need the exact
`_any` key. This policy refresh was not applied to production.

Identifier management adds four self-only routes for current-factor proof, add/replace requests,
new-destination verification, and removal. All require `iam.user.identifier_manage`. Read
`identifierRevision` from the user before starting. Keep at least one usable login identifier;
staff retain email. Completion revokes refresh sessions and returns the frontend to login.
These contracts are implemented locally; deployment, IAM reseed, revision backfill, and live
verification are pending. Failed delivery does not change the account; restart with fresh proof.
