# Customer deals

Deals are shared retail offers managed by administrators and available to customers
for one-off purchases. They are not CRM records owned by individual customers.

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
npm run check:release

# Separate Levants-client storefront
npm run test:deals
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

The backend release suite includes all deal, checkout, permission, validation,
concurrency and index-migration tests. Unit/integration tests use a temporary
MongoDB replica set and mocked Stripe, image upload and outbound email transports.
They do not send fixture customer notifications. Admin release checks run UI
interaction tests, strict TypeScript checks, the existing lint gate and a production build.
The storefront PR has its own tests, full TypeScript check, scoped deals lint and build.

### Real browser and Stripe checks

GitHub Actions checks out both `feat/customer-deals` branches and runs the real
admin, storefront and API with an isolated MongoDB replica set. Stripe uses test
keys and its CLI forwards signed webhooks. The deals lane runs:

```bash
cd server
npm run test:e2e:deals:ci
```

It covers desktop/mobile creation with image validation and file persistence,
homepage discovery, basket and checkout display; the admin edit/schedule/
deactivate/reactivate/archive lifecycle with reloads; real Stripe totals; fully
funded store credit; and signed-in/guest purchases through the storefront and
hosted Stripe Checkout, including signed-webhook confirmation and exactly-once
stock consumption after a reload. Successful screenshots and failure traces are
stored in the `deals-e2e-diagnostics` artifact. The full existing subscription
E2E and analytics E2E suites run separately as regression gates.

The browser harness captures the Cloudinary upload boundary and outbound mail,
and substitutes geocoding. Image parsing, managed-file records, deals services,
permissions, pricing, stock transactions, customer login and Stripe payments
remain real. This does not verify production Cloudinary credentials or production
email delivery.

### Release procedure

Require green checks on both PRs for the reviewed commit. Deploy the server before
either UI. No destructive data migration or backfill is needed: startup explicitly
creates the deal indexes even when automatic indexing is disabled; this is tested
on a fresh collection and can safely be repeated. Shared product/file references
and archived offer snapshots retain historical order information.

After deployment, smoke-test one offer with the deployed image provider, desktop/
mobile discovery, checkout and payment confirmation using the intended environment
credentials. CI verifies the isolated application; it does not deploy these branches
or certify production provider configuration.
