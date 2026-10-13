# CI scheduling

| Event | Automatic verification |
| --- | --- |
| Feature branch push | No full test run; open a PR for quick feedback |
| PR to UAT or another development branch | Safety/configuration checks, pure unit tests, admin unit/type checks, lint and build |
| Push to UAT | Configuration/safety checks, build/package, UAT deployment and configured-provider verification |
| Ready PR to main | Complete backend regression, admin quality checks, subscription Stripe/browser, Deals checkout/refund/browser and navigation browser suites |
| Push to main | Full release checks again for the exact merged commit; production deployment waits for every release gate |
| Manual Deals/navigation workflow | Browser/integration verification on the explicitly selected branch |

Development PRs cancel superseded development runs. Production and UAT deployments retain their existing deployment concurrency and environment controls.

Deals and navigation suites are reusable release workflows. They no longer trigger independently on feature/UAT events or repeat the full backend regression already run by the main workflow. They remain manually runnable.

UAT promotion evidence still requires the exact source tree, commit ancestry, successful UAT deployment, and provider verification. Stripe/browser evidence moves to the main release gate; production explicitly waits for subscriptions, Deals and navigation checks. No application logic or deployment targets are changed.

These changes take effect only after this branch is merged. Existing runs are not cancelled or retroactively changed by this configuration.
