# Analytics browser E2E

This lane runs the built release admin client (served with Vite preview) against
the real Express analytics/auth routes and an isolated in-memory Mongo replica set.

It deliberately does **not** use Stripe or the customer portal. The fixture is
read-only and deterministic:

- website sale: Analytics Milk
- subscription-generated sale: Analytics Eggs
- imported/manual sale with a subscription marker to verify channel precedence
- low-stock Analytics Milk variant

The browser workflow also verifies filter/comparison changes, trend rendering,
product/variant drilldowns, CSV export, retry and empty states, direct SPA routes,
mobile layout, and browser/API error cleanliness.

Run from `server/`:

```bash
npm run test:e2e:analytics
```
