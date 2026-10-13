# Deals admin verification

The admin implementation lives in `Levants-server/client`, on `feature/deals`. This work does not merge into or deploy UAT or production.

## Implemented

- Named private drafts, editing, publishing and unpublishing through dedicated lifecycle endpoints.
- Fixed package prices, fixed pound savings and percentage savings. Price previews recompute from variant prices and quantities using the backend's penny rounding.
- Permission-controlled editing, publishing, activation, deactivation and confirmed archiving. Failed actions keep the existing row/form available for retry.
- Existing product/variant catalog browsing, quantities, images, dates, featured status and display order.
- Storefront preview for listing/detail views, desktop/tablet/mobile and light/dark themes. Draft visibility is explicitly labelled.

## Scope protection

All unrelated admin source files, shared components, global styles and existing scripts match imported UAT commit `486a3478813c7a028799696c1ba9ca2112bf2a13`. Only Deals routes/imports and the Deals navigation entry are added to the existing App and layout. Deals catalog types and editor-specific component variations are scoped under `pages/Deals`; they do not change Discounts or other screens. UAT independently removed its completed one-time maintenance workflow and updated two deployment-only files while verification ran. Those exact file updates are synchronized from `f8f5ead10010bbe1382edb7bb165e7a34c337d74` on Deals without a branch merge or executing maintenance scripts. All existing workflows and deployment files now match that UAT snapshot.

Four development test dependencies and Deals verification scripts are added to the admin package.

The existing UAT frontend has 31 TypeScript diagnostics unrelated to Deals. `npm run test:deals-types` compares the complete frontend with that exact UAT baseline and fails on new diagnostics. This is not a claim that UAT's existing full type check is clean.

## Test coverage

Three organized Vitest suites cover form pricing/rounding, API endpoint/envelope contracts, and admin behaviour: drafts, savings modes, edit/retry, pending saves, listing/retry, permissions, lifecycle actions, merchandising, date validation, image rejection and stock availability.

The dedicated test-only Deals workflow builds the production admin bundle and runs real Chromium browser flows against the real API and isolated Mongo database. Its admin browser scenarios cover desktop/mobile imaged offer creation and customer discovery, persisted editing and schedules, deactivate/reactivate/archive, and private draft save/reload/publish/unpublish with both savings modes. Browser screenshots, reports and failure traces are uploaded as `deals-admin-browser-evidence`. Image hosting is captured by the isolated test provider; Stripe calls use sandbox credentials.

The separate storefront/API and real Stripe browser jobs remain enabled, alongside full UAT plus Deals backend regression when backend/shared harness files change. Frontend-only and Deals browser-test changes reuse the passing backend regression because server runtime and Jest tests are unchanged.

## Results

Backend source and Jest suites are unchanged from the passing regression at `282f811e2bc984fb0b330823ed7ce9ff41273996`: **1,612 tests / 186 suites**, no skipped tests, in [the backend job](https://github.com/Litwebs/Levants-server/actions/runs/38374820372/job/115220496989).

The first complete frontend/browser pass was at `29b57405874c1679cdf18240384fab207588d18a`, in [run 38377245769](https://github.com/Litwebs/Levants-server/actions/runs/38377245769): **46 admin tests / 3 suites**, build, scoped lint and no new TypeScript diagnostics; **5/5 admin browser flows**; **12/12 storefront/API cases**; **2/2 actual Stripe payment/refund cases**.

Visual inspection identified a dark-preview heading contrast issue after that run. Admin code commit `4fb48958eed180981ae9e7cabc055fc4798d7115` passed all 46 admin tests, build/lint/type comparisons, all five browser flows and all 12 storefront/API cases in [run 38377408028](https://github.com/Litwebs/Levants-server/actions/runs/38377408028). A browser assertion confirms heading colours follow the preview theme; the resulting dark/mobile screenshot was visually inspected.

Final test-harness commit `173ff7181b43798f79cd5e6ebcd728e936a0dc2b` adds a bounded same-session retry for a cold Stripe sandbox submission. [Final verification run 38378380347](https://github.com/Litwebs/Levants-server/actions/runs/38378380347) passed:

| Check | Result |
| --- | --- |
| Admin Vitest | 46 tests / 3 suites passed |
| Admin browser | 5 desktop/mobile flows passed |
| Storefront/API | 12 scenarios passed |
| Real Stripe sandbox | 2 payment/refund scenarios passed |
| Production admin build and scoped lint | Passed |
| TypeScript comparison | No new errors; existing 31 UAT diagnostics preserved |

The full backend job is intentionally skipped on this final browser-test-only commit. Its server runtime and Jest tests are byte-identical to the 1,612-test passing regression linked above.

The card-only Stripe sandbox case intermittently remained unpaid after its initial hosted-form click; the credit-assisted case passed, and both cases passed together on another run. The test now blurs the card field and checks the country/button readiness before submission. If that same sandbox session remains unpaid for five seconds with an available payment button, it retries once and logs the retry. It still requires actual payment, exact totals, signed webhook replay, single inventory consumption and a real refund. This retry is test-only and does not add application payment retries. The underlying hosted-form readiness explanation is an inference from the intermittent cold-session behaviour.

The admin API currently rejects clearing every item from an existing draft. The editor reports this constraint and blocks the save; it does not silently retain the removed items. Newly created incomplete drafts are supported and verified.

This verification uses isolated test databases and Stripe sandbox payments. It does not assert that a particular live UAT deployment is running these commits.
