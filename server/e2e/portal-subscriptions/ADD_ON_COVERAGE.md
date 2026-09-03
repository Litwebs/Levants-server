# Next-delivery add-on E2E coverage

This ledger defines the release-gate coverage for paid, one-time products added
to a subscription's single next delivery. All Stripe assertions use test mode,
and all model assertions use the isolated Mongo replica set created by the E2E
harness.

## Customer journey

| ID | Spec | Scenario | Required result |
| --- | --- | --- | --- |
| ADDON-UI-01 | `portal-ui.spec.js` | Select multiple products and quantities | The basket shows the selected lines and exact immediate charge. |
| ADDON-UI-02 | `portal-ui.spec.js` | Open the final confirmation | The dialog states that the action cannot be reversed and that the saved card is charged immediately. |
| ADDON-UI-03 | `portal-ui.spec.js` | Choose **Go back** | No request, PaymentIntent, delivery add-on, order mutation, or subscription mutation occurs; the selection remains available. |
| ADDON-UI-04 | `portal-ui.spec.js` | Confirm a funded purchase | The charge succeeds, the portal returns to the subscription, and only the next delivery receives the add-on. |
| ADDON-UI-05 | `portal-ui.spec.js` | Review the subscription snapshot | Product names, quantities, add-on amount, and combined next-delivery total are visible. |
| ADDON-UI-06 | `portal-ui.spec.js` | Expand upcoming deliveries | Every row is interactive; the generated order shows recurring items, add-ons, fee, total, and a green **Generated** status. Later deliveries contain no add-on. |
| ADDON-UI-07 | `portal-ui.spec.js` | Card declines, then customer funds the card and retries | The failed attempt changes nothing. The funded retry creates exactly one successful add-on charge and one delivery mutation. |
| ADDON-UI-08 | `portal-ui.spec.js` | Next delivery is past cut-off | The page explains that add-ons are closed and exposes no payment action. |
| ADDON-UI-09 | `portal-ui.spec.js` | Subscription is paused | The detail page hides the entry point; direct navigation explains that the subscription must be active and exposes no payment action. |

## API, model, order, and Stripe integrity

| ID | Spec | Scenario | Required result |
| --- | --- | --- | --- |
| ADDON-PAY-01 | `stripe-integrity.spec.js` | Funded add-on | One succeeded GBP PaymentIntent has the exact server-calculated amount and delivery/operation metadata. |
| ADDON-PAY-02 | `stripe-integrity.spec.js` | Retry the same operation ID | Stripe and Mongo idempotency prevent a second charge, add-on, order line, or payment allocation. |
| ADDON-PAY-03 | `stripe-integrity.spec.js` | Submit separate purchases for the same delivery | Each operation charges exactly once and accumulates on that delivery and order without changing later deliveries. |
| ADDON-PAY-04 | `stripe-integrity.spec.js` | Insufficient funds | No delivery, order, recurring Price, subscription, or successful-payment state changes. |
| ADDON-GUARD-01 | `stripe-integrity.spec.js` | Past cut-off | The API rejects before creating a delivery-add-on PaymentIntent or mutation. |
| ADDON-GUARD-02 | `stripe-integrity.spec.js` | Paused subscription | The API rejects before charging or mutating. |
| ADDON-GUARD-03 | `stripe-integrity.spec.js` | Another customer targets the subscription | Ownership lookup returns no subscription and nothing is charged. |
| ADDON-GUARD-04 | `stripe-integrity.spec.js` | Invalid UUID or quantity | Request validation rejects before service or payment execution. |
| ADDON-GUARD-05 | `stripe-integrity.spec.js` | Product has no available stock | Inventory validation rejects before payment or mutation. |
| ADDON-GUARD-06 | `stripe-integrity.spec.js` | Subscription has no upcoming delivery | The API rejects without creating a PaymentIntent. |
| ADDON-GUARD-07 | `stripe-integrity.spec.js` | Customer has no default card | The API requests a default card without charging or mutating. |
| ADDON-SCOPE-01 | Both specs | Recurring subscription integrity | Local recurring items, pending changes, Stripe Price, and remote subscription Price remain unchanged. |
| ADDON-SCOPE-02 | Both specs | Delivery scope | Only the chronologically next eligible delivery contains the one-time products. |

## Fulfilment integration

| ID | Spec | Scenario | Required result |
| --- | --- | --- | --- |
| ADDON-FULFIL-01 | `Tests/subscriptions/subscriptionWebhook.e2e.test.js` | Paid add-on exists before invoice fulfilment | The signed invoice-success flow merges it into the generated order exactly once. |
| ADDON-FULFIL-02 | `Tests/subscriptions/subscriptionWebhook.e2e.test.js` | Payment accounting | The order contains separate subscription-invoice and delivery-add-on allocations and the add-on payment links to the order. |
| ADDON-FULFIL-03 | `Tests/subscriptions/subscriptionWebhook.e2e.test.js` | Future recurring state | The generated order contains the add-on but the subscription item set remains unchanged. |

## Release gate

GitHub Actions runs `npm run test:release` for backend integration tests and
`npm run test:e2e:subscriptions:ci` for the complete Playwright suite before
the deploy job is allowed to start. A failure in any row above blocks
deployment.
