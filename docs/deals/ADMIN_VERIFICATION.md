# Deals admin verification

The admin implementation lives in `Levants-server/client`, on `feature/deals`. This work does not merge into or deploy UAT or production.

## Implemented

- Named private drafts, editing, publishing and unpublishing through dedicated lifecycle endpoints.
- Fixed package prices, fixed pound savings and percentage savings. Price previews recompute from variant prices and quantities using the backend's penny rounding.
- Permission-controlled editing, publishing, activation, deactivation and confirmed archiving. Failed actions keep the existing row/form available for retry.
- Existing product/variant catalog browsing, quantities, images, dates, featured status and display order.
- Storefront preview for listing/detail views, desktop/tablet/mobile and light/dark themes. Draft visibility is explicitly labelled.

## Scope protection

All unrelated admin source files, shared components, global styles and existing scripts match imported UAT commit `486a3478813c7a028799696c1ba9ca2112bf2a13`. Only Deals routes/imports and the Deals navigation entry are added to the existing App and layout. Deals catalog types and editor-specific component variations are scoped under `pages/Deals`; they do not change Discounts or other screens. Four development test dependencies and Deals verification scripts are added to the admin package.

The existing UAT frontend has 31 TypeScript diagnostics. `npm run test:deals-types` compares the complete frontend with that exact UAT baseline and fails on new diagnostics. This is not a claim that UAT's existing full type check is clean.

## Test coverage

Three organized Vitest suites cover form pricing/rounding, API endpoint/envelope contracts, and admin behaviour: drafts, savings modes, edit/retry, pending saves, listing/retry, permissions, lifecycle actions, merchandising, date validation, image rejection and stock availability.

The dedicated test-only Deals workflow builds the production admin bundle and runs real Chromium browser flows against the real API and isolated Mongo database. Its admin browser scenarios cover desktop/mobile imaged offer creation and customer discovery, persisted editing and schedules, deactivate/reactivate/archive, and private draft save/reload/publish/unpublish with both savings modes. Browser screenshots, reports and failure traces are uploaded as `deals-admin-browser-evidence`. Image hosting is captured by the isolated test provider; Stripe calls use sandbox credentials.

The separate storefront/API and real Stripe browser jobs remain enabled, alongside full UAT plus Deals backend regression when backend/test-harness files change.

## Results

Verification is in progress. Record final CI run, exact code commit and measured test totals here after completion.
