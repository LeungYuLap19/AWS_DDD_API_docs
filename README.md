# PetPetClub API reference

Run `python -m http.server 8000` in this directory and open `http://localhost:8000`, or use the [published GitHub Pages site](https://leungyulap19.github.io/AWS_DDD_API_docs/). Open [openapi.yaml](openapi.yaml) to save the contract for LLM tools and code generators. Choose an endpoint, fill its request fields on the left, and use **Send request** on the right. The preview follows those inputs and offers HTTP, Shell, Node, Ruby, and PHP examples. Success and error response structures are listed below the form. The specification uses OpenAPI 3.1 and YAML 1.2.

The reference describes 248 implemented operations. Printing-photo upload and response additions are preview-deployed; paid guest/user photo reads passed live verification. Four deferred routes and three preview/smoke routes are omitted. The contract covers subscriptions, placement sites, localized species/breed catalogs, public contacts, unified ownership events (including audited internal corrections), recovery image replacement and event-date filters, PTag location reports, and external adoption listings.

## List display labels

OpenAPI `2026-11-25.2` adds list display labels.
The 28 affected lists return a `display` object with referenced names/codes. Missing or
hard-deleted references return null labels while preserving stored IDs and parent rows.
These labels do not grant related detail/contact access. Existing detail and mutation
responses receive no new reference-name fields.

## Immutable order printing photos

The approved per-unit printing-photo contract is documented directly in [openapi.yaml](openapi.yaml).
OpenAPI 2026-11-24.7 marks the upload and response additions
`x-implementation-status: deployed`. Preview deployment succeeded in
[action 45356580799](https://github.com/LeungYuLap19/AWS_DDD_API/actions/runs/45356580799); paid guest/user order and private PTag photo reads passed live verification.
Attachments are write-once from first acceptance, with no replacement/removal endpoint.
`expiresAt` describes temporary download-URL validity, not photo retention. Authenticated PTag
photo reads additionally require linked-order read authority; lists/public lookups gain no photos.
Upload each photo after creating the quote and before calling the existing JSON draft endpoint.
The upload uses the exact quote's `x-checkout-token`. It does not extend quote expiry or change
pricing, payment commands, callbacks or refunds. Proven single-unit legacy orders may have null
item/quantity indexes and unknown options; canonical quote units always have integer indexes.

Paid guest and authenticated PTag orders both wait for issued tags before their payment-confirmation
email includes tag codes, short links and inline QR images. Email delivery does not claim guest
orders for an account or grant permission to assign a tag to a pet.

## Public endpoints

New-user creation requires both `givenName` and `familyName` for personal registration and
organization/internal membership registration. Each name must contain 1-100 characters after
text sanitization. Missing, null, blank, markup-only or oversized names return HTTP 400 before
account creation. Existing nullable profiles and profile updates are unchanged.

The reference marks these 24 operations with **[PUBLIC]** in endpoint titles and
`x-public: true` in OpenAPI. Search **[PUBLIC]** to show only these operations.
They require neither an account access JWT nor an API key. Login passwords, OTPs,
request validation, rate limits, and other endpoint-specific checks still apply.

| Area | Public operations |
| --- | --- |
| Logistics addresses | `POST /logistics/lookups/areas`<br>`POST /logistics/lookups/net-codes`<br>`POST /logistics/lookups/pickup-locations` |
| Authentication | `POST /auth/challenges`<br>`POST /auth/challenges/verify`<br>`POST /auth/password/login`<br>`POST /auth/registrations/users` |
| PTag product catalog | `GET /commerce/catalog/products/ptags`<br>`GET /commerce/catalog/products/ptags/{productId}` |
| Checkout quote | `POST /commerce/checkouts/quotes` |
| Shop codes | `GET /commerce/discount-codes`<br>`POST /commerce/discount-codes/verify` |
| Order lookup | `GET /commerce/orders/public/{orderReference}` |
| Payment return handoff | `GET /commerce/payments/return`<br>`POST /commerce/payments/return` |
| Reference catalogs | `GET /reference-data/animal-species`<br>`GET /reference-data/adoption-listings`<br>`GET /reference-data/adoption-listings/{listingId}` |
| PTag lookup/location submission | `GET /pets/ptags/{tagCode}`<br>`POST /pets/ptags/{tagCode}/location-reports` |
| Recovery cases | `GET /pets/recovery-cases`<br>`POST /pets/recovery-cases`<br>`GET /pets/recovery-cases/{caseId}` |
| Subscription plans | `GET /subscriptions/plans` |

Public order/recovery/PTag reads return their documented public projections, not
private management records. Recovery submission also accepts an optional signed-in
identity. Payment return pages are public browser handoffs; payment completion is
not established by opening one. Provider tokenization data is applied only after
signature verification.

**No bearer JWT does not mean public.** Refresh/desktop/logout routes use existing
session credentials; guest checkout draft/read/payment/cancel use `x-checkout-token`;
device secret claim uses a provisioning token. Device calls and the notification
outbox trigger require their signatures and API key. Payment notify requires the
provider signature. These operations intentionally have no **[PUBLIC]** label.
`POST /users/{userId}/commerce/checkouts/drafts` additionally requires account JWT,
API key, and checkout token. An unmarked operation is not evidence of public access:
follow its documented `security` and credential requirements.

For frontend error handling, each operation lists the HTTP statuses its handlers return. Open a `4xx` response to see its JSON fields, the allowed `errorKey` values, and an example for each key. Branch on `errorKey`, not the localized `error` message. The `4XX` and `5XX` entries remain as fallbacks for gateway and unexpected responses. SF Express address payloads are passed through as provider-defined JSON because the Lambda does not validate their fields.

The published contract is [openapi.yaml](openapi.yaml). Local generation and audit scripts are excluded from Git.

## Discount-code verification uploads

`POST /commerce/discount-codes/verify` accepts a shop code as `application/json` or a PDF as
`multipart/form-data` in the `file` field. Use `application/pdf`; `application/x-pdf` and a
filename ending in `.pdf` are also accepted. JPEG, PNG and WebP uploads are not supported.
The decoded request body is limited to **5 MiB (5,242,880 bytes)**, including multipart
boundaries, headers and other fields. Leave room for that overhead when choosing a PDF.
Oversized requests return `413 common.requestBodyTooLarge`; unsupported files without a
shop code return `400 catalog.errors.invalidVerificationFileType`.

A non-empty `shopCode` takes precedence over uploaded files. PDFs are read in memory and
discarded, with no asset ID or order attachment. Pass the returned `matchedShopCode` as
`items[].shopCode` when requesting a checkout quote.

## Organization pet management list

Use `GET /pets?ownerType=organization&ownerId={organizationId}&view=management&sortBy=nextDewormDueDate&sortOrder=asc&page=1&limit=7`
for a page-at-a-time management table. Omitting `view` preserves the existing summary list.
The management view adds `organizationPetNumber`, `nextDewormDueDate`, `sterilization`, and a
five-minute `coverUrl`. It applies search, filters and sorting before pagination and returns
the matching authorized total. `nextDewormDueDate` is the next scheduled date, not a last-treatment date.

Management supports birthday, organization-number and next-due-date sorts, sex/sterilization/life-state
filters, organization-number matching, and inclusive birthday/due-date ranges with optional missing values.
Use the canonical query names in OpenAPI; legacy `ngoPetId`, `lastDewormDate`, and combined `status`
are not accepted. Independent profile, external-identifier and deworm list access is required.
Agreement pets need all three exact-pet capabilities; internal readers need each corresponding `_any` key.

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

Medical CRUD (approved 2026-11-23) restores scoped list/create/update/delete defaults for personal
and owning-NGO roles across vaccines, deworms, general medical, medication, and blood tests.
Current ownership remains required. Non-owner NGO/clinic providers need an active pet-specific
agreement selecting the exact key; internal broad operations need the matching `_any` key.
The five DELETE endpoints permanently remove one record with an atomic human audit event,
accept no body/query, and return `{ recordId }`. Missing records return 404; related service records
and delivered notifications remain. Preview commit `2a632be` deployed successfully through
[action 45147511855](https://github.com/LeungYuLap19/AWS_DDD_API/actions/runs/45147511855).
SG development IAM reseed added ten definitions and updated five revision-checked policies;
a repeat plan found zero changes. All 1,058 regression tests passed. Live checks verified owner,
foreign-owner, exact/revoked agreement, ceiling, and ownerless internal access: 17 physical deletes
produced 17 audit events; 15 denied/invalid mutations preserved target hashes. Fixtures were closed
and temporary helpers removed. OTP delivery and server commit-order races were not retested.
Production policy is unchanged.

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

## Notification preferences (deployed to SG development, 2026-11-20)

The four user/organization preference routes are now in [openapi.yaml](openapi.yaml).
Each recipient has independent in-app/email/WhatsApp switches per feature. Missing rows return
all-enabled defaults without initialization. PUT upserts a complete strict channel map.
User settings remain self-only across all account classes. Organization settings require the
selected acting organization and current IAM grants; staff default read, admins default edit.

The shared outbox checks preferences on each attempt for pet anomalies, PTag location reports,
and deworm reminders. Existing contacts, channel support, paid entitlements, and source checks
remain mandatory. Disabling in-app keeps external-delivery anchors hidden from inbox lists,
counts, and read mutations. Sent channels stay sent; completed outbox work is never replayed.

API `37a0d2e` was tested in temporary legacy development. Preview run `44684260220` restored all
34 functions to the original SG `petpetclub_development`; preference indexes and the audited SG
IAM refresh are verified. No preference documents were seeded. Live PTag/deworm tests passed
defaults, all-off, independent channels, hidden inbox
list/count/read exclusion, retry changes, sent preservation, and no replay after re-enabling.
Four real emails were accepted and confirmed received; four WhatsApp attempts reached Meta and
failed as expected. Existing verified contacts, users, plans, and subscriptions were preserved.
Temporary preference rows were removed, restoring missing-row defaults. Organization writes were
not part of that earlier legacy batch. No preference rows are seeded; anomaly/entitlement remains skipped.

The final SG return preserved accounts, memberships, contacts, catalogs and plans. Fifteen IAM
changes wrote fifteen audits; repeat seed verification found no changes. Subsequent SG organization
tests passed admin/staff defaults, reviewed update grant/revoke, cross-org denial, ten PTag/deworm
channel cases, and system inbox visibility/counts/filter/read. Signed outbox triggers exercised the
real worker without Atlas. Four emails were accepted; the first pair was confirmed received. Four
WhatsApp attempts failed with expected Meta 404 errors. Fixtures were removed, isolated accounts/orgs
closed, and the temporary helper deleted; original data fingerprints matched. Atlas configuration
and anomaly entitlement were not tested. An existing payment execution-identity index differs from current model options;
its separate data/index migration remains open. Two historical, already-disabled legacy-transfer
permission definitions were retained, without restoring their removed routes or seed grants.


## Organization role eligibility (deployed to SG development, 2026-11-23)

Role-default reads/writes include `organizationTypeKeys`; organization roles require a nonempty
unique list of supported types, while personal/internal roles use `[]`. The internal role list
accepts `organizationType` before counting/pagination. Role codes do not determine eligibility.
Reusable organization role policies are not restricted by individual organization ceilings.
Standing authorization intersects the target ceiling; both membership grant/revoke arrays remain
ceiling-bounded. Pet agreement grants keep their existing `agreementEligible` and exact-pet checks,
independent of the standing role and ceiling. SG development metadata inventory/backfill and IAM seed
verification completed on 2026-11-23, before strict enforcement deployment. All ten roles now have
explicit eligibility; fifteen organization assignments passed audit. No grants or per-organization
ceilings changed; repeat plans were empty. Production was untouched.


## Standing-permission explanation and picker lookup (deployed to SG development, 2026-11-23)

OpenAPI 2026-11-23.2 extends four existing GET contracts. User access keeps effective
`permissionKeys` and adds `permissionResolution`; organization/internal membership details add
that same explanation without changing membership Reach. Unusable memberships remain inspectable
as configured data, with no effective authority; this is not a past-time access snapshot.

The internal permission catalog accepts strict grant/revoke target references and returns per-row
eligibility plus resolved lookup context. Blocked rows and pagination totals remain visible.
Write validators and authorization share the relevant algebra and predicates; per-key eligibility
does not bypass transactional whole-write checks. Shared roles are not organization-ceiling-bound.
Agreement grants remain independent. No endpoint, permission, dependency or collection was added.
Organization-scoped lookup authority and portal wiring remain separate work. API commit
`e59cfc72387ef73888d77a8840ac37cbe1eb75be` deployed successfully through
[deployment run 45112372198](https://github.com/LeungYuLap19/AWS_DDD_API/actions/runs/45112372198).
Eighteen live read and boundary checks passed; 54 new response objects matched this OpenAPI
contract. These focused checks do not constitute the full IAM system test matrix. Production
was untouched.


IAM override contract update (2026-11-23.3): grants already supplied by the selected default
policy are rejected on membership/organization writes. Role changes must clear grants that the
new role supplies; shared baseline edits report assignment impact before introducing overlaps.
Rich access/member reads expose `baselinePermissionKeys` and `grantedPermissionKeys`.
`GET /permissions?purpose=grant|revoke&eligibleOnly=true` returns only applicable options, filtered
before pagination/counting; target-reference and read-permission requirements remain unchanged.
Omit `eligibleOnly` to inspect all matching rows and blocking reasons. Saved overrides remain
readable and removable. API commit `c4137654ffd4132868f5879c2049f7fbfbefb575` deployed to SG preview:
[deployment 45126237606](https://github.com/LeungYuLap19/AWS_DDD_API/actions/runs/45126237606)
passed alias verification and smoke testing; CI also passed. Portal changes remain local. No
backfill or reseed was performed. Authenticated live override checks were not repeated for this patch.


## IAM permission sources

Personal accounts use the shared personal role default. Organization and internal staff receive roles and overrides through their respective memberships. Membership detail reads include the configured permission breakdown and current effective result. Organization permission reads describe the organization's ceiling, not an individual member's access. `GET /users/{userId}/access` remains a read-only API projection for authorized clients and signed-in actor resolution; the management portal has no selected-user Permissions page. This UI decision adds no response fields, endpoint, permission key or seed change.

## Organization short names

Organization create (`POST /auth/registrations/organizations`) and identity edits
(`PATCH /organizations/{organizationId}`) accept optional `shortName`: sanitized, trimmed text
of 1-5 characters, or null to clear it. Blank text and longer values return
`400 common.invalidBodyParams`. Organization list/detail/edit responses always include the
nullable field, including null for existing documents without it. The value is user-set,
case-preserving, and globally unique ignoring case. Duplicate create/PATCH writes return specific 409 short-name conflicts. Existing create/edit permissions and organization
ceiling/Reach checks apply; no new permission or seed is required. This field does not generate
or rewrite pet external identifiers.

Use `POST /pets/{petId}/external-identifiers/organization-pet-number` to allocate
`UPPERCASE(shortName) + YY + four-digit annual number`, such as `PPC260123`. The selected
organization must own the pet and hold standing create permission within its ceiling. Body is
omitted or `{}`. Existing issuer numbers return 200; new numbers return 201. Missing short name
returns `409 pet.identifier.shortNameRequired`; exhaustion of the 9,999 annual numbers returns
`409 pet.identifier.sequenceExhausted`. No random suffix or legacy-counter import. Prefix changes
never rewrite assigned values.

Public logistics address lookups accept an optional existing provider token; omission obtains one server-side. Credentials are not returned. Token issuance, shipping and delivery remain protected. Source IAM seeds remove the unused lookup key; applying seeds remotely is a separate step.

Checkout quotes own delivery pricing. Production charges one HKD 50.00 delivery fee per
quote; development/previews use HKD 0.10 for controlled testing. Read returned pricing; do
not calculate fees from product catalog fields. Existing quote/order snapshots stay fixed.

## Organization pet status

Private organization status accepts the 11 canonical keys in `PetOrganizationStatusKey`, including
`lost`. `at_home` remains unsupported. `lost` does not create a recovery report or change ownership.
Current organization ownership is required to edit; independently authorized retained reads remain
scoped to the organization/pet pair. No permission grants or default policies change.
