# AWS DDD API reference

Run `python -m http.server 8000` in this directory and open `http://localhost:8000`, or use the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/). Open [openapi.yaml](openapi.yaml) to save the contract for LLM tools and code generators. Choose an endpoint, fill its request fields on the left, and use **Send request** on the right. The preview follows those inputs and offers HTTP, Shell, Node, Ruby, and PHP examples. Success and error response structures are listed below the form. The specification uses OpenAPI 3.1 and YAML 1.2.

The 246 documented operations describe implemented routes, callers, and client rules. Four deferred routes and three preview/smoke routes are omitted. The contract covers subscriptions, placement sites, localized species/breed catalogs, public contacts, unified ownership events (including audited internal corrections), recovery image replacement and event-date filters, PTag location reports, and external adoption listings.

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
These contracts deployed to SG development on 2026-11-20, followed by revision backfill, IAM
refresh, and security-focused live verification. OTP personal replacement and staff password-proof
phone add/remove and email replacement passed. Session/proof replay, cross-account access,
revoked permission, invalid revisions, and invalid JWTs were rejected. Failed delivery does not
change the account; restart with fresh proof. Personal/internal access JWTs expire normally; organization requests now require a live password session. Completion
revokes all refresh sessions. Concurrency, expiry, provider failures, and rollback also have
automated coverage; this rollout did not inject those faults into the live database.

Organization self password change is deployed to SG development and documented at `POST /users/{userId}/password-change`.
Send `currentPassword` and `newPassword` in organization context with the exact IAM key. No email OTP is required.
Initial credentials set `mustChangePassword: true`; show password replacement before business screens.
Refresh/logout remain available. New passwords contain 12–72 characters and at most 72 UTF-8 bytes, without trimming.
Success revokes all sessions, clears the refresh cookie, and requires login with the new password.
Organization access tokens are denied after session revocation. Personal/internal users remain OTP-only.
The catalog key is organization-only; all six organization defaults and the shared ceiling retain it.
API `93fbaff` deployed successfully, followed by the scoped IAM refresh and security-focused live tests.
With `mustChangePassword: true`, business reads/writes returned `403 common.passwordChangeRequired`.
Browser refresh, desktop exchange and desktop refresh retained that flag and restriction; logout worked.
Password replacement revoked old sessions. Only fresh login with the new password gained normal access.
Three fixture accounts are closed; four sanitized security audits were verified. One late invalid-refresh
probe hit the shared IP cooldown; DB readback confirmed every old session was revoked. No production rollout.

## Notification preferences (deployed to legacy development, 2026-11-20)

The four user/organization preference routes are now in [openapi.yaml](openapi.yaml).
Each recipient has independent in-app/email/WhatsApp switches per feature. Missing rows return
all-enabled defaults without initialization. PUT upserts a complete strict channel map.
User settings remain self-only across all account classes. Organization settings require the
selected acting organization and current IAM grants; staff default read, admins default edit.

The shared outbox checks preferences on each attempt for pet anomalies, PTag location reports,
and deworm reminders. Existing contacts, channel support, paid entitlements, and source checks
remain mandatory. Disabling in-app keeps external-delivery anchors hidden from inbox lists,
counts, and read mutations. Sent channels stay sent; completed outbox work is never replayed.

API `37a0d2e` deployed successfully; all 34 preview functions now target legacy
`petpetclub_development`. All 75 modeled collections/indexes and the audited IAM refresh were
verified. Live PTag/deworm tests passed defaults, all-off, independent channels, hidden inbox
list/count/read exclusion, retry changes, sent preservation, and no replay after re-enabling.
Four real emails were accepted and confirmed received; four WhatsApp attempts reached Meta and
failed as expected. Existing verified contacts, users, plans, and subscriptions were preserved.
Temporary preference rows were removed, restoring missing-row defaults. Anomaly/entitlement and
organization-context write testing were not performed. No preference rows are seeded.
