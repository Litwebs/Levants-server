# Customer deals

The admin dashboard supports single-product offers and bundles of up to 30
variants. Admins select products, quantities, an optional JPG/PNG/WEBP image
(maximum 5 MB), a package price in GBP, and optional start/expiry dates.
The price must be below the live combined retail value. Blank dates mean
immediate availability with no expiry. Images fall back to product images.

## Entry points and permissions

- Admin: **Catalogue → Deals**, `/deals`; creation wizard at `/deals/new`.
- Customer: `/deals`, `/deals/:slug`, header/portal navigation and **Current
  Deals** on the homepage. Featured offers sort first; other active offers fill
  the homepage section when fewer than three are featured.
- Reuses `promotions.read`, `promotions.create`, `promotions.update` and
  `promotions.delete`. Catalogue browsing requires create or update permission.
- Admins can edit, deactivate/reactivate, or permanently archive an offer.
  Archived offers remain in history and cannot be reactivated.

## API and database

Admin CRUD is under `/api/admin/deals`, with `/catalog` for a paginated product
picker and `/:dealId/archive` for archival. Public listing and lookup are under
`/api/deals` and `/api/deals/:slug`. Both use the application's response envelope.

MongoDB stores a new `deals` collection. Startup creates its indexes, including
the unique slug index, even with production `autoIndex` disabled. No existing
data backfill or destructive migration is required. Managed deal images are
included in file reference checks so shared images are retained.

Only active offers within their schedule, with active products/variants,
sufficient unreserved stock and a valid saving, appear publicly. Public
pagination counts available offers. Times are stored as UTC instants; dashboard
date fields use the administrator's browser timezone.

## Checkout

Basket packages remain separate from normal product lines. Checkout expands
their component quantities and sends a deal claim containing `dealId`,
`quantity`, `expectedPackagePrice` and `expectedContents`. The server computes
prices from the database, verifies allocation across all claimed offers and
reserves the real variant stock in the order transaction. Changed prices,
changed contents, expired/inactive offers and insufficient stock fail checkout
without leaving an order or reservations behind.

Deal savings cannot be combined with discount codes. They can be combined with
store credit: Stripe receives one fixed adjustment while order accounting keeps
the two amounts separate. Existing order payment, fulfilment and cancellation
paths continue to operate on component variants. Orders retain deal snapshots
and their savings after an offer is edited or archived. Offers accepted into a
pending order use the existing reservation/payment window, even if the offer's
expiry passes during payment.

Customers can use **Refresh offers** at checkout to reload changed prices,
contents and stock, or remove unavailable offers. Network failures retain the
basket. Existing product-only saved baskets remain supported.

## Verification and rollout

Run `npm ci` in `server`, `client`, and the separate storefront repository.

```bash
# Backend
cd server
npm test -- --runTestsByPath Tests/Deals/deals.checkout.e2e.test.js Tests/Deals/deals.lifecycle.test.js Tests/Deals/deals.permissions.e2e.test.js Tests/Deals/deals.image.test.js Tests/Deals/deals.hardening.e2e.test.js
npm run test:release

# Admin UI
cd ../client
npm run test:deals
npm run build

# Separate Levants-client storefront
npm run test:deals
npm run build
```

Tests use a temporary MongoDB replica set and mocked Stripe, image upload and
outbound email transports. They do not send fixture customer notifications.

Deploy the server before either UI, then create an offer in staging and check
desktop/mobile creation, editing, image upload, homepage discovery and basket
refresh. Complete a Stripe test-mode checkout and confirm webhook payment and
stock consumption before production release.

Implementation verification: 60 targeted backend tests passed; the broader
release suite had 988 passing tests and 12 failures. All 12 failures reproduce on
the original `ac-merge` baseline (11 analytics fixtures and one delivery-proof
upload test). Five admin and six storefront interaction tests pass. Both production UI builds
pass. Existing TypeScript errors also
remain on the baselines; the component catalog check also has the same existing
missing `PageTransition` failure. Browser visual verification was blocked by the current
environment; desktop/mobile staging review and live Stripe test-mode verification
remain required.
