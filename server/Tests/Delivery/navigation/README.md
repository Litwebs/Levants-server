# Delivery directions navigation suite

- `navigationLinks.util.test.js`: all providers, driving directions, URL encoding,
  coordinate validation, complete address fallback, missing destinations, legacy compatibility.
- `getRoute.navigation.service.test.js`: per-stop enrichment, address fallback,
  deleted orders, driver ownership, admin access and missing routes.
- `getRoute.navigation.e2e.test.js`: authenticated HTTP responses backed by the
  test database, legacy API compatibility, historical orders and access controls.
- `../../../e2e/delivery-navigation/navigation-selection.spec.js`: production menu
  component, provider selection, actual intercepted link navigation, keyboard
  controls, stop-click isolation and missing destinations across desktop and mobile viewports.

Run from `server`:

```sh
npm run test:delivery-navigation:unit
npm run test:delivery-navigation
npm run test:e2e:delivery-navigation
npm run test:release
```

Browser tests require the client dependencies and `npx playwright install chromium`.
The standalone browser config does not require Stripe or the customer storefront.
All Jest tests are also included in the existing full server release suite.
The delivery navigation workflow runs the dedicated suite, full release suite,
admin release checks and browser tests without deploying.

HTTPS provider links let the device open an associated installed app or its web
alternative. Browser tests intercept providers to verify the selected URL without
calling external services. Native app handoff must additionally be checked on
physical devices with and without installed navigation apps; browser emulation
cannot establish that operating-system behavior.
