# Analytics performance guard

The release Jest suite includes a deterministic dashboard performance test using
1,000 paid orders spread over 30 days, five products, and all three mutually
exclusive sales channels.

The test has two budgets:

1. **Structural query budget** — protects against accidental duplicate scans or
   N+1-style growth in the dashboard orchestration.
2. **Latency budget** — the warmed in-memory dashboard must complete within
   8,000 ms by default.

The latency threshold is intentionally conservative because GitHub-hosted runner
speed varies. It is a regression guard, not a claim about production latency.
Production-scale profiling should still use representative production hardware
and data volumes.

To run only this guard:

```bash
npm run test:analytics:performance
```

Override the latency budget when profiling slower local hardware:

```bash
ANALYTICS_PERF_BUDGET_MS=12000 npm run test:analytics:performance
```
