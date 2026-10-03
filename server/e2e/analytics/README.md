# Analytics browser E2E

This lane runs the real admin client against the real Express analytics/auth
routes and an isolated in-memory Mongo replica set.

It deliberately does **not** use Stripe or the customer portal. The fixture is
read-only and deterministic:

- website sale: Analytics Milk
- subscription-generated sale: Analytics Eggs
- imported/manual sale with a subscription marker to verify channel precedence
- low-stock Analytics Milk variant

Run from `server/`:

```bash
npm run test:e2e:analytics
```
